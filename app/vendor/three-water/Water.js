// Three.js r128, MIT. Local adaptations are documented in PROVENANCE.md.
export function makeWater(THREE) {

	/**
 * References:
 *	http://www.valvesoftware.com/publications/2010/siggraph2010_vlachos_waterflow.pdf
 * 	http://graphicsrunner.blogspot.de/2010/08/water-using-flow-maps.html
 *
 */

	class Water extends THREE.Mesh {

		constructor( geometry, options = {} ) {

			super( geometry );
			this.type = 'Water';
			const scope = this;
			const color = options.color !== undefined ? new THREE.Color( options.color ) : new THREE.Color( 0xFFFFFF );
			const textureWidth = options.textureWidth || 512;
			const textureHeight = options.textureHeight || 512;
			const clipBias = options.clipBias || 0;
            const renderBackground = options.renderBackground !== false;
            const savedClearColor = new THREE.Color();
			const flowDirection = options.flowDirection || new THREE.Vector2( 1, 0 );
			const flowSpeed = options.flowSpeed || 0.03;
			const reflectivity = options.reflectivity || 0.02;
			const scale = options.scale || 1;
			const shader = options.shader || Water.WaterShader;
			const encoding = options.encoding !== undefined ? options.encoding : THREE.LinearEncoding;
			const textureLoader = new THREE.TextureLoader();
			const flowMap = options.flowMap || undefined;
			const normalMap0 = options.normalMap0 || textureLoader.load( 'textures/water/Water_1_M_Normal.jpg' );
			const normalMap1 = options.normalMap1 || textureLoader.load( 'textures/water/Water_2_M_Normal.jpg' );
			const cycle = 0.15; // a cycle of a flow map phase

			const halfCycle = cycle * 0.5;
            const normalWorld=new THREE.Vector3(),surfaceWorld=new THREE.Vector3(),eyeWorld=new THREE.Vector3(),rotation=new THREE.Matrix4(),flip=new THREE.Matrix4().makeRotationX(Math.PI);
			const textureMatrix = new THREE.Matrix4();
            const reflectionMatrix = new THREE.Matrix4(), reflectionInverse = new THREE.Matrix4();
            const refractionMatrix = new THREE.Matrix4(), refractionInverse = new THREE.Matrix4();
            const bias = new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
            const depthTexture = options.depthTexture === true;
			let simulationTime = 0; // Advanced only by the existing gameplay update.
			this.setSimulationTime = seconds => { simulationTime = seconds; };

			if ( THREE.Reflector === undefined ) {

				console.error( 'THREE.Water: Required component THREE.Reflector not found.' );
				return;

			}

			if ( THREE.Refractor === undefined ) {

				console.error( 'THREE.Water: Required component THREE.Refractor not found.' );
				return;

			}

			const reflector = new THREE.Reflector( geometry, {
				textureWidth: textureWidth,
				textureHeight: textureHeight,
				clipBias: clipBias,
				encoding: encoding, depthTexture: depthTexture
			} );
			const refractor = new THREE.Refractor( geometry, {
				textureWidth: textureWidth,
				textureHeight: textureHeight,
				clipBias: clipBias,
				encoding: encoding, depthTexture: depthTexture
			} );
			reflector.matrixAutoUpdate = false;
			refractor.matrixAutoUpdate = false; // material

			this.material = new THREE.ShaderMaterial( {
				uniforms: THREE.UniformsUtils.merge( [ THREE.UniformsLib[ 'fog' ], shader.uniforms ] ),
				vertexShader: shader.vertexShader,
				fragmentShader: shader.fragmentShader,
				transparent: true,
				fog: true,
                side: THREE.DoubleSide
			} );

			if ( flowMap !== undefined ) {

				this.material.defines.USE_FLOWMAP = '';
				this.material.uniforms[ 'tFlowMap' ] = {
					type: 't',
					value: flowMap
				};

			} else {

				this.material.uniforms[ 'flowDirection' ] = {
					type: 'v2',
					value: flowDirection
				};

			} // maps


			normalMap0.wrapS = normalMap0.wrapT = THREE.RepeatWrapping;
			normalMap1.wrapS = normalMap1.wrapT = THREE.RepeatWrapping;
			this.material.uniforms[ 'tReflectionMap' ].value = reflector.getRenderTarget().texture;
			this.material.uniforms[ 'tRefractionMap' ].value = refractor.getRenderTarget().texture;
			this.material.uniforms[ 'tNormalMap0' ].value = normalMap0;
			this.material.uniforms[ 'tNormalMap1' ].value = normalMap1; // water

			this.material.uniforms.waterSide={value:1};
            Object.assign(this.material.uniforms, {
                reflectionMatrix: {value:reflectionMatrix}, refractionMatrix:{value:refractionMatrix},
                reflectionInverse:{value:reflectionInverse}, refractionInverse:{value:refractionInverse},
                waterBasis:{value:new THREE.Matrix3()}, waterSurfaceNormal:{value:new THREE.Vector3()},
                reflectionTexel:{value:new THREE.Vector2(1/textureWidth,1/textureHeight)},
                tReflectionDepth:{value:reflector.getRenderTarget().depthTexture},
                tRefractionDepth:{value:refractor.getRenderTarget().depthTexture}
            });
            if(depthTexture) this.material.defines.DEPTH_OPTICS = '';
            this.material.uniforms[ 'color' ].value = color;
			this.material.uniforms[ 'reflectivity' ].value = reflectivity;
			this.material.uniforms[ 'textureMatrix' ].value = textureMatrix; // inital values

			this.material.uniforms[ 'config' ].value.x = 0; // flowMapOffset0

			this.material.uniforms[ 'config' ].value.y = halfCycle; // flowMapOffset1

			this.material.uniforms[ 'config' ].value.z = halfCycle; // halfCycle

			this.material.uniforms[ 'config' ].value.w = scale; // scale
			// functions

			function updateTextureMatrix( camera ) {

				textureMatrix.set( 0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0 );
				textureMatrix.multiply( camera.projectionMatrix );
				textureMatrix.multiply( camera.matrixWorldInverse );
				textureMatrix.multiply( scope.matrixWorld );

			}

			function updateFlow() {

				
				const config = scope.material.uniforms[ 'config' ];
				config.value.x = (flowSpeed * simulationTime) % cycle; // flowMapOffset0

				config.value.y = config.value.x + halfCycle; // flowMapOffset1
				// Important: The distance between offsets should be always the value of "halfCycle".
				// Moreover, both offsets should be in the range of [ 0, cycle ].
				// This approach ensures a smooth water flow and avoids "reset" effects.

				if ( config.value.x >= cycle ) {

					config.value.x = 0;
					config.value.y = halfCycle;

				} else if ( config.value.y >= cycle ) {

					config.value.y = config.value.y - cycle;

				}

			} //


			this.dispose = () => { reflector.dispose(); refractor.dispose(); this.material.dispose(); };
			this.getRenderTargets = () => [reflector.getRenderTarget(), refractor.getRenderTarget()];
			this.onBeforeRender = function ( renderer, scene, camera ) {

				updateTextureMatrix( camera );
                rotation.extractRotation(scope.matrixWorld);normalWorld.set(0,0,1).applyMatrix4(rotation);
                surfaceWorld.setFromMatrixPosition(scope.matrixWorld);eyeWorld.setFromMatrixPosition(camera.matrixWorld);
                const below=normalWorld.dot(eyeWorld.sub(surfaceWorld))<0;
                scope.material.uniforms.waterSide.value=below?-1:1;
                scope.material.uniforms.waterBasis.value.setFromMatrix4(rotation);
                scope.material.uniforms.waterSurfaceNormal.value.copy(normalWorld).normalize();
                updateFlow();
				scope.visible = false;
				reflector.matrixWorld.copy( scope.matrixWorld );
				refractor.matrixWorld.copy( scope.matrixWorld );
                if(below){reflector.matrixWorld.multiply(flip);refractor.matrixWorld.multiply(flip);}
				const outputEncoding = renderer.outputEncoding, toneMapping = renderer.toneMapping;
                const target = renderer.getRenderTarget(), xr = renderer.xr.enabled, shadow = renderer.shadowMap.autoUpdate;
                const background=scene.background, clearAlpha=renderBackground?1:renderer.getClearAlpha();
                if(!renderBackground) renderer.getClearColor(savedClearColor);
                try {
                    renderer.outputEncoding = THREE.LinearEncoding; renderer.toneMapping = THREE.NoToneMapping;
                    if(!renderBackground){scene.background=null;renderer.setClearColor(0x000000,0);}
                    reflector.onBeforeRender( renderer, scene, camera );
                    refractor.onBeforeRender( renderer, scene, camera );
                    // Each target uses the actual virtual camera, including its
                    // clip plane. No shared UV plus fixed screen-axis flip.
                    const rc=reflector.getCamera(), tc=refractor.getCamera();
                    reflectionMatrix.multiplyMatrices(rc.projectionMatrix,rc.matrixWorldInverse);
                    reflectionInverse.copy(reflectionMatrix).invert(); reflectionMatrix.premultiply(bias);
                    refractionMatrix.multiplyMatrices(tc.projectionMatrix,tc.matrixWorldInverse);
                    refractionInverse.copy(refractionMatrix).invert(); refractionMatrix.premultiply(bias);
                } finally {
                    renderer.outputEncoding = outputEncoding; renderer.toneMapping = toneMapping;
                    if(!renderBackground){scene.background=background;renderer.setClearColor(savedClearColor,clearAlpha);}
                    renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadow; renderer.setRenderTarget(target);
                    if(camera.viewport)renderer.state.viewport(camera.viewport);
                    scope.visible = true;
                }

			};

		}

	}

	Water.prototype.isWater = true;
	Water.WaterShader = {
		uniforms: {
			'color': {
				type: 'c',
				value: null
			},
			'reflectivity': {
				type: 'f',
				value: 0
			},
			'tReflectionMap': {
				type: 't',
				value: null
			},
			'tRefractionMap': {
				type: 't',
				value: null
			},
			'tNormalMap0': {
				type: 't',
				value: null
			},
			'tNormalMap1': {
				type: 't',
				value: null
			},
			'textureMatrix': {
				type: 'm4',
				value: null
			},
			'config': {
				type: 'v4',
				value: new THREE.Vector4()
			}
		},
		vertexShader:
  /* glsl */
  `

		#include <common>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>

		uniform mat4 textureMatrix;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;
        varying vec3 vWaterPosition;

		void main() {

			vUv = uv;
			vCoord = textureMatrix * vec4( position, 1.0 );

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWaterPosition = worldPosition.xyz;
            vToEye = cameraPosition - worldPosition.xyz;

			vec4 mvPosition =  viewMatrix * worldPosition; // used in fog_vertex
			gl_Position = projectionMatrix * mvPosition;

			#include <logdepthbuf_vertex>
			#include <fog_vertex>

		}`,
		fragmentShader:
  /* glsl */
  `

		#include <common>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>

		uniform sampler2D tReflectionMap;
		uniform sampler2D tRefractionMap;
		uniform sampler2D tNormalMap0;
		uniform sampler2D tNormalMap1;

		#ifdef USE_FLOWMAP
			uniform sampler2D tFlowMap;
		#else
			uniform vec2 flowDirection;
		#endif

		uniform vec3 color;
		uniform float reflectivity;
        uniform float waterSide;
        uniform mat3 waterBasis;
        uniform vec3 waterSurfaceNormal;
        uniform mat4 reflectionMatrix, refractionMatrix;
        uniform mat4 reflectionInverse, refractionInverse;
        uniform vec2 reflectionTexel;
        #ifdef DEPTH_OPTICS
            uniform sampler2D tReflectionDepth, tRefractionDepth;
        #endif
		uniform vec4 config;

		varying vec4 vCoord;
		varying vec2 vUv;
		varying vec3 vToEye;
        varying vec3 vWaterPosition;

		void main() {

			#include <logdepthbuf_fragment>

			float flowMapOffset0 = config.x;
			float flowMapOffset1 = config.y;
			float halfCycle = config.z;
			float scale = config.w;

			vec3 toEye = normalize( vToEye );

			// determine flow direction
			vec2 flow;
			#ifdef USE_FLOWMAP
				flow = texture2D( tFlowMap, vUv ).rg * 2.0 - 1.0;
			#else
				flow = flowDirection;
			#endif
			flow.x *= - 1.0;

			// sample normal maps (distort uvs with flowdata)
			vec4 normalColor0 = texture2D( tNormalMap0, ( vUv * scale ) + flow * flowMapOffset0 );
			vec4 normalColor1 = texture2D( tNormalMap1, ( vUv * scale ) + flow * flowMapOffset1 );

			// linear interpolate to get the final normal color
			float flowLerp = abs( halfCycle - flowMapOffset0 ) / halfCycle;
			vec4 normalColor = mix( normalColor0, normalColor1, flowLerp );

			// calculate normal vector
			vec3 normal = normalize(waterBasis * vec3(normalColor.r * 2.0 - 1.0, normalColor.g * 2.0 - 1.0, normalColor.b));

			// calculate the fresnel term to blend reflection and refraction maps
			normal *= waterSide;
            float theta = max( dot( toEye, normal ), 0.0 );
            // Dielectric Fresnel on both sides. Schlick plus a hard TIR switch
            // produces a visible discontinuity at the water-to-air critical angle.
            float rootF0=sqrt(clamp(reflectivity,0.0001,0.99));
            float waterIOR=(1.0+rootF0)/(1.0-rootF0);
            float eta=waterSide<0.0?waterIOR:1.0/waterIOR;
            float sinTransmitted2=eta*eta*(1.0-theta*theta);
            float cosTransmitted=sqrt(max(0.0,1.0-sinTransmitted2));
            float rs=(eta*theta-cosTransmitted)/max(0.00001,eta*theta+cosTransmitted);
            float rp=(theta-eta*cosTransmitted)/max(0.00001,theta+eta*cosTransmitted);
            float reflectance=sinTransmitted2>=1.0?1.0:0.5*(rs*rs+rp*rp);

            vec4 reflectionCoord = reflectionMatrix * vec4(vWaterPosition,1.0);
            vec4 refractionCoord = refractionMatrix * vec4(vWaterPosition,1.0);
            vec2 reflectionUV = reflectionCoord.xy / reflectionCoord.w;
            vec2 refractionUV = refractionCoord.xy / refractionCoord.w;
            float reflectedDistance = 0.0;
            #ifdef DEPTH_OPTICS
                // Reconstruct the first visible point on each planar ray. Its
                // distance sets the ripple displacement, in world coordinates.
                float rd=texture2D(tReflectionDepth,reflectionUV).x;
                vec4 rh=reflectionInverse*vec4(reflectionUV*2.0-1.0,rd*2.0-1.0,1.0);
                reflectedDistance=min(length(rh.xyz/(abs(rh.w)<.00001?.00001:rh.w)-vWaterPosition),60.0);
                vec3 reflected=reflect(-toEye,normal);
                vec4 reflectedProjection=reflectionMatrix*vec4(vWaterPosition+reflected*reflectedDistance,1.0);
                vec2 bent=reflectedProjection.xy/max(.0001,reflectedProjection.w);
                float edge=smoothstep(0.0,.025,min(min(bent.x,bent.y),min(1.0-bent.x,1.0-bent.y)));
                reflectionUV=mix(reflectionUV,bent,edge*step(0.0001,reflectedProjection.w));
                if(reflectance<.9999){
                    float td=texture2D(tRefractionDepth,refractionUV).x;
                    vec4 th=refractionInverse*vec4(refractionUV*2.0-1.0,td*2.0-1.0,1.0);
                    float transmittedDistance=min(length(th.xyz/(abs(th.w)<.00001?.00001:th.w)-vWaterPosition),60.0);
                    vec4 tp=refractionMatrix*vec4(vWaterPosition+refract(-toEye,normal,eta)*transmittedDistance,1.0);
                    vec2 bentTransmission=tp.xy/max(.0001,tp.w);
                    float te=smoothstep(0.0,.025,min(min(bentTransmission.x,bentTransmission.y),min(1.0-bentTransmission.x,1.0-bentTransmission.y)));
                    refractionUV=mix(refractionUV,bentTransmission,te*step(.0001,tp.w));
                }
            #else
                // WebGL1 without depth textures: project the perturbed normal
                // through each camera, rather than applying world X/Z to UVs.
                vec3 deltaNormal=normal-waterSurfaceNormal*waterSide;
                vec4 rDelta=reflectionMatrix*vec4(vWaterPosition+deltaNormal,1.0);
                vec4 tDelta=refractionMatrix*vec4(vWaterPosition-deltaNormal*.4,1.0);
                reflectionUV=mix(reflectionUV,rDelta.xy/max(.0001,rDelta.w),.65);
                refractionUV=mix(refractionUV,tDelta.xy/max(.0001,tDelta.w),.65);
            #endif
            vec2 margin=reflectionTexel*2.0;
            reflectionUV=clamp(reflectionUV,margin,1.0-margin);
            refractionUV=clamp(refractionUV,margin,1.0-margin);
            // A narrow reconstruction filter avoids a razor-sharp second floor
            // on the moving interface. It does not replace the actual image.
            vec2 spread=reflectionTexel*(.5+min(reflectedDistance*.06,1.5));
            vec4 reflectColor=texture2D(tReflectionMap,reflectionUV)*.4;
            reflectColor+=(texture2D(tReflectionMap,reflectionUV+vec2(spread.x,0.0))+
                texture2D(tReflectionMap,reflectionUV-vec2(spread.x,0.0))+
                texture2D(tReflectionMap,reflectionUV+vec2(0.0,spread.y))+
                texture2D(tReflectionMap,reflectionUV-vec2(0.0,spread.y)))*.15;
            vec4 refractColor=texture2D(tRefractionMap,refractionUV);
            // Color targets clear to transparent in an enclosed tank. Linear
            // filtering may touch clipped/empty pixels at the wall contact.
            // Recover straight color and retain coverage, instead of importing
            // the outdoor background as a bright seam along the waterline.
            reflectColor.rgb/=max(reflectColor.a,.0001);
            refractColor.rgb/=max(refractColor.a,.0001);

			// multiply water color with the mix of both textures
			gl_FragColor = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );

			#include <tonemapping_fragment>
			#include <encodings_fragment>
			#include <fog_fragment>

		}`
	};

	return Water;

}
