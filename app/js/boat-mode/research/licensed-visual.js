import {loadModelAsset} from '../../assets/model-asset-runtime.js?v=16';
import {createShipMeshNavigation} from './mesh-navigation.js';
import {RCRV_LAYOUT} from './layout.js';
import {createSubmarineMesh} from '../../ocean/submarine-visual.js';

export function createLicensedResearchVessel(THREE, entry, options = {}) {
  const root=new THREE.Group();root.name=entry.label;
  Object.assign(root.userData,{transportCatalogId:entry.id,transportDomain:'maritime',playable:true,enterable:true,researchVesselState:'loading',researchLayout:RCRV_LAYOUT,originalUnbrandedDesign:false});
  const controller=new AbortController(),leases=[],owned=[],paint=[];
  let disposed=false,loading=false,content=null,navigation=null,sub=null;
  const detailed=options.state==='active';
  function cleanupContent(){
    navigation?.dispose();navigation=null;delete root.userData.researchNavigation;
    sub?.userData.disposeCuratedMarineVisual?.();sub=null;
    delete root.userData.researchSubmarine;
    for(const lease of leases.splice(0))lease.dispose();
    for(const object of owned.splice(0)){object.geometry?.dispose();object.material?.map?.dispose();object.material?.dispose();}
    for(const material of paint.splice(0))material.dispose();
    root.userData.vesselDamageMaterials=[];
    if(content)root.remove(content);content=null;
  }
  function plate(x,y,z,title){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const c=canvas.getContext('2d');c.fillStyle='#112530';c.fillRect(0,0,512,128);c.fillStyle='#e2eced';c.font='600 34px sans-serif';c.textAlign='center';c.fillText(title,256,76);
    const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.45),new THREE.MeshBasicMaterial({map:texture}));plane.position.set(x,y,z);plane.rotation.y=Math.PI;plane.userData.excludeShipNavigation=true;owned.push(plane);content.add(plane);
  }
  async function furnishing(id,x,y,z,width,yaw=0){
    const lease=await loadModelAsset(THREE,id,{signal:controller.signal});
    if(disposed){lease.dispose();return;}
    leases.push(lease);
    const host=new THREE.Group(),bounds=new THREE.Box3().setFromObject(lease.root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=width/Math.max(size.x,.001);
    lease.root.position.set(-center.x,-bounds.min.y,-center.z);host.scale.setScalar(scale);host.add(lease.root);host.position.set(x,y,z);host.rotation.y=yaw;content.add(host);
  }
  async function load(){
    if(disposed||loading)return false;loading=true;root.userData.researchVesselState='loading';
    try{
      const vessel=await loadModelAsset(THREE,`marine-research-vessel-rcrv${detailed?'':'-lod'}`,{signal:controller.signal});
      if(disposed){vessel.dispose();return false;}
      leases.push(vessel);content=new THREE.Group();content.add(vessel.root);root.add(content);
      // Damage belongs to this vessel; never darken a shared template or the
      // retained parent ship in another scene. Textures stay cache-owned.
      const materials=new Map();vessel.root.traverse(object=>{
        if(!object.isMesh)return;
        const clone=source=>{if(!materials.has(source)){const material=source.clone();materials.set(source,material);paint.push(material);}return materials.get(source);};
        object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);
      });
      root.userData.vesselDamageMaterials=paint.map(material=>({material,baseColor:material.color.getHex(),baseRoughness:material.roughness}));
      for(const [side,color] of [[1,0xff4d47],[-1,0x4dff82]]){
        const light=new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),new THREE.MeshBasicMaterial({color}));
        light.position.set(side*7.2,7.4,10);light.userData.vesselNavigationLight=true;light.userData.excludeShipNavigation=true;owned.push(light);content.add(light);
      }
      if(detailed){
        await furnishing('solis-laboratory-desk',6,1.985,-21,2.1,Math.PI);
        await furnishing('solis-laboratory-desk',3,1.944,-28.4,1.8,Math.PI);
        await furnishing('solis-command-console',0,1.944,-24.6,1.5,Math.PI);
        if(disposed)return false;
        sub=createSubmarineMesh({THREE,OCEAN_CONSTANTS:{SUB_SCALE:.86}});sub.name='Docked research submarine';root.userData.researchSubmarine=sub;sub.position.set(-4,RCRV_LAYOUT.floorY+1.55,-32.2);sub.rotation.y=Math.PI;
        sub.traverse(o=>{if(o.isLight)o.intensity=0;});content.add(sub);
        for(const z of [-34.5,-30]){
          const cradle=new THREE.Mesh(new THREE.BoxGeometry(2.7,.28,.25),new THREE.MeshStandardMaterial({color:0x344754,metalness:.4,roughness:.65}));
          cradle.position.set(-4,RCRV_LAYOUT.floorY+.14,z);owned.push(cradle);content.add(cradle);
        }
        if(!await sub.userData.visualReady)throw Error('The docked submarine could not load.');
        if(disposed)return false;
        plate(3,3.4,-28.4,'NAVIGATION');plate(0,3.5,-24.6,'DECK HELM');plate(6,3.65,-21,'WATER LAB');
        // Query the admitted hull and actual equipment, not an independent set
        // of guessed invisible walls. The ship-local index lives with this lease.
        navigation=createShipMeshNavigation(THREE,root);
        for(const station of RCRV_LAYOUT.stations){
          const support=navigation.support(station.x,station.z,station.y);
          if(support==null||navigation.blocked(station.x,station.z,.3,support))throw Error(`Vessel access is obstructed at ${station.id}.`);
        }
        root.userData.researchNavigation=navigation;
      }
      content.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      root.userData.researchVesselState='ready';return true;
    }catch(error){
      cleanupContent();if(!disposed){root.userData.researchVesselState='failed';root.userData.researchVesselError=String(error.message||error);}return false;
    }finally{loading=false;}
  }
  root.userData.retryResearchVisual=()=>{
    if(disposed||loading||root.userData.researchVesselState==='ready')return root.userData.visualReady;
    cleanupContent();return root.userData.visualReady=load();
  };
  root.userData.visualReady=load();
  return {root,dispose(){if(disposed)return;disposed=true;controller.abort();cleanupContent();for(const child of [...root.children])child.userData.disposeVesselAttachment?.();root.parent?.remove(root);root.userData.researchVesselState='disposed';}};
}
