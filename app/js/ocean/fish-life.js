import {loadFishVisual} from './fish-visual.js';
import {fitFishToWater,fishSeededRandom} from './fish-water-envelope.js';
import { createUnderwaterSchoolPlan } from '../fishing/population-authority.js?v=2';
import {createCetaceanLife} from './cetacean-life.js';

export function createOceanFishLifeApi({ oceanMode, disposeObject3D, sampleWater, isBlocked=()=>false, metersPerUnit=1,loadVisual=loadFishVisual,loadCetaceanVisual }) {
  const _tmpVecA = new THREE.Vector3();
  const cetaceans=createCetaceanLife({THREE,oceanMode,sampleWater,isBlocked,loadVisual:loadCetaceanVisual});

  function createFishTemplate(options = {}) {
    const group=new THREE.Group();
    const bodyMaterial=new THREE.MeshStandardMaterial({color:options.bodyColor||0x79888a,roughness:.5,metalness:.12,vertexColors:true});
    const bodyGeometry=new THREE.SphereGeometry(1,20,12),p=bodyGeometry.attributes.position,colors=[];
    // Swim axis is +Z, matching lookAt and the eyes/tail. Countershading and
    // a tapered caudal peduncle replace the old sideways balloon body.
    for(let i=0;i<p.count;i++){
      const z=p.getZ(i),y=p.getY(i),taper=.72+.28*(z+1)*.5;
      p.setXYZ(i,p.getX(i)*.22*taper,y*.34*taper,z*.72);
      const shade=y>0?.6+(1-y)*.22:.85+Math.abs(y)*.15;colors.push(shade,shade,shade);
    }
    bodyGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));bodyGeometry.computeVertexNormals();
    group.add(new THREE.Mesh(bodyGeometry,bodyMaterial));
    const finMaterial=new THREE.MeshStandardMaterial({color:options.finColor||0x4f5d61,roughness:.7,side:THREE.DoubleSide});
    function fin(points){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.computeVertexNormals();return new THREE.Mesh(geo,finMaterial)}
    const tail=new THREE.Group();tail.name='fishTail';tail.position.z=-.62;
    tail.add(fin([0,0,0, 0,.38,-.42, 0,.07,-.25, 0,0,0, 0,-.07,-.25, 0,-.38,-.42]));group.add(tail);
    group.add(fin([0,.18,.30, 0,.52,-.1, 0,.17,-.5]));
    group.add(fin([0,-.17,.1, 0,-.40,-.2, 0,-.14,-.5]));
    for(const side of [-1,1])group.add(fin([side*.14,0,.18,side*.48,-.08,-.12,side*.10,-.07,-.24]));
    const eyeMaterial=new THREE.MeshStandardMaterial({color:0x10141a,roughness:.22});const eyeGeometry=new THREE.SphereGeometry(.028,8,6);
    for(const side of [-1,1]){const eye=new THREE.Mesh(eyeGeometry,eyeMaterial);eye.position.set(side*.125,.085,.53);group.add(eye)}
    return group;
  }

  let templates=[],lastTime=null,simulationTime=0,visualGeneration=0,visualController=null;
  function clearFishLife() {
    cetaceans.clear();
    visualGeneration++;visualController?.abort();visualController=null;
    for(const fish of oceanMode.fishEntities){fish.visual?.dispose();fish.mesh?.parent?.remove(fish.mesh);}
    // Instances share template buffers/materials. Dispose once, only after the
    // last instance detaches; never dispose a template while clones still live.
    const geometry=new Set(),materials=new Set();
    for(const root of templates)root?.traverse(child=>{
      if(child.geometry)geometry.add(child.geometry);
      for(const material of [].concat(child.material||[]))materials.add(material);
    });
    for(const item of geometry)item.dispose();
    for(const item of materials)item.dispose();
    templates=[];lastTime=null;simulationTime=0;
    oceanMode.fishEntities=[];oceanMode.fishSchools=[];
    oceanMode.underwaterSchoolPlan=null;oceanMode.fishPopulationContext=null;
    if(oceanMode.sharkEntity?.mesh)disposeObject3D(oceanMode.sharkEntity.mesh);
    oceanMode.sharkEntity=null;
  }

  function fit(point,fish,school) {
    const fitted=fitFishToWater({...point,radius:fish.radius,water:sampleWater(point.x,point.z),
      depthBand:school.spawnDepthMeters,nearBottom:school.waterColumnPosition==='near-bottom'});
    return fitted&&!isBlocked(fitted,fish.radius)?fitted:null;
  }

  function initFishLife(scene,populationContext=null) {
    clearFishLife();
    const schoolPlan=createUnderwaterSchoolPlan(populationContext,{maximumSchools:5});
    oceanMode.fishPopulationContext=populationContext;oceanMode.underwaterSchoolPlan=schoolPlan;
    const mammalsReady=cetaceans.init(scene,populationContext);
    oceanMode.fishVisualsReady=mammalsReady;
    if(!schoolPlan.playable)return;
    const generation=visualGeneration;visualController=new AbortController();const signal=visualController.signal,pending=[];
    const random=fishSeededRandom(populationContext.contextId);
    const offset=oceanMode.habitat?.plan?.offset || {x:0,z:0};
    const anchors=[[-38,66],[36,112],[-46,157],[92,178],[-103,118]];
    oceanMode.fishSchools=schoolPlan.schools.map((school,index)=>{
      const x=anchors[index][0]+offset.x,z=anchors[index][1]+offset.z;
      const water=sampleWater(x,z)?.volume;
      const depth=Math.min(school.spawnDepthMeters[1]-1,Math.max(school.spawnDepthMeters[0]+1,14+index*4));
      const y=oceanMode.habitat?.plan?.featured&&Number.isFinite(water?.bottomY)?water.bottomY+5:-(depth/metersPerUnit);
      return {...school,anchor:new THREE.Vector3(x,y,z),center:new THREE.Vector3(x,y,z),radius:12+index*3,
        speed:.08+random()*.045,verticalAmp:1.4,driftPhase:random()*Math.PI*2};
    });
    templates=oceanMode.fishSchools.map(school=>school.visual?.assetId?null:createFishTemplate({bodyColor:school.visual?.body,finColor:school.visual?.fin}));
    oceanMode.fishSchools.forEach((school,schoolIndex)=>{
      for(let i=0;i<school.count;i++){
        // Use the catalogue's centimetre range in this world's metres/units.
        const length=(school.lengthCm[0]+random()*(school.lengthCm[1]-school.lengthCm[0])*.55)/100/metersPerUnit;
        const fish={schoolIndex,speciesId:school.speciesId,populationContextId:populationContext.contextId,livePresenceClaim:false,
          radius:Math.max(.18,length*.55),phase:random()*Math.PI*2,orbitScale:.7+random()*.5,
          drift:(random()-.5)*1.5,tailPhase:random()*Math.PI*2,tailSpeed:6+random()*3,tailAmp:.25,
          moveSpeed:(.8+random()*.65)/metersPerUnit};
        let initial=null;
        for(let attempt=0;attempt<24&&!initial;attempt++){
          const angle=fish.phase+attempt*.47,radius=school.radius*(.65+attempt*.025);
          initial=fit({x:school.anchor.x+Math.cos(angle)*radius,y:school.anchor.y+fish.drift,z:school.anchor.z+Math.sin(angle)*radius},fish,school);
        }
        if(!initial)continue;
        const mesh=templates[schoolIndex]?.clone(true)||new THREE.Group();mesh.scale.setScalar(length/1.76);
        mesh.position.set(initial.x,initial.y,initial.z);mesh.name=`Ocean fish · ${school.species}`;
        mesh.userData.speciesId=school.speciesId;mesh.userData.livePresenceClaim=false;
        mesh.traverse(child=>{if(child.isMesh){child.castShadow=false;child.receiveShadow=false;}});
        fish.mesh=mesh;fish.tail=mesh.getObjectByName('fishTail');scene.add(mesh);oceanMode.fishEntities.push(fish);
        fish.visualState=school.visual?.assetId?'loading':'generated';
        if(school.visual?.assetId){
          mesh.visible=false;
          pending.push(loadVisual(THREE,school.visual.assetId,{signal}).then(visual=>{
            if(generation!==visualGeneration||signal.aborted){visual.dispose();return;}
            fish.visual=visual;fish.visualState='licensed';mesh.add(visual.root);
          }).catch(error=>{if(generation===visualGeneration&&!signal.aborted){fish.visualState='unavailable';fish.visualError=String(error.message||error).slice(0,200);}}));
        }

      }
    });
    oceanMode.fishVisualsReady=Promise.all([mammalsReady,...pending]).then(()=>undefined);
  }

  function updateFishLife(t,simulationDelta=null) {
    const dt=Number.isFinite(simulationDelta)?Math.max(0,Math.min(.1,simulationDelta)):(lastTime==null?0:Math.max(0,Math.min(.1,t-lastTime)));lastTime=t;
    simulationTime+=dt;t=simulationTime;
    cetaceans.update(dt);
    for(const school of oceanMode.fishSchools){
      const drift=t*.035+school.driftPhase;
      school.center.set(school.anchor.x+Math.sin(drift)*2,school.anchor.y,school.anchor.z+Math.cos(drift)*2);
    }
    for(const fish of oceanMode.fishEntities){
      const school=oceanMode.fishSchools[fish.schoolIndex],mesh=fish.mesh;
      const orbit=t*school.speed+fish.phase,radius=school.radius*fish.orbitScale;
      const target={x:school.center.x+Math.cos(orbit)*radius,y:school.center.y+Math.sin(orbit*1.3)*school.verticalAmp+fish.drift,z:school.center.z+Math.sin(orbit)*radius};
      const heading=Math.atan2(target.x-mesh.position.x,target.z-mesh.position.z),step=fish.moveSpeed*dt;
      const dy=Math.max(-step*.5,Math.min(step*.5,target.y-mesh.position.y));
      let next=null;
      // Bounded steering avoids both static reef/hull geometry and the moving
      // player/sub. A blocked path holds its last safe pose; no teleporting.
      for(const turn of [0,.65,-.65,1.25,-1.25,Math.PI]){
        const candidate=fit({x:mesh.position.x+Math.sin(heading+turn)*step,y:mesh.position.y+dy,z:mesh.position.z+Math.cos(heading+turn)*step},fish,school);
        if(candidate&&Math.hypot(candidate.x-mesh.position.x,candidate.y-mesh.position.y,candidate.z-mesh.position.z)<=step*1.13+.0001){next=candidate;break;}
      }
      if(next&&step>0){
        _tmpVecA.set(next.x,next.y,next.z);mesh.lookAt(_tmpVecA);mesh.position.copy(_tmpVecA);
      }
      // A changed terrain tile or a hull arriving on top of an animal must not
      // leave a visible fish clipping through it while it finds a clear route.
      const current=fit({x:mesh.position.x,y:mesh.position.y,z:mesh.position.z},fish,school);
      mesh.visible=['generated','licensed'].includes(fish.visualState)&&!!current&&Math.abs(current.y-mesh.position.y)<.01;
      fish.visual?.update(t*fish.tailSpeed+fish.tailPhase);
      if(fish.tail)fish.tail.rotation.y=Math.sin(t*fish.tailSpeed+fish.tailPhase)*fish.tailAmp;
    }
  }

  return {clearFishLife,initFishLife,updateFishLife};
}
