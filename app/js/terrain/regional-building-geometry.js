// Split wall and roof vertices retain independent facade bays at every corner.
export function appendRegionalBuildingFootprint({positions,colors,styles,layouts,indices},footprint,topTriangles,massing,baseY,unitsPerMeter){
 const {heightMeters,color}=massing,topY=baseY+heightMeters*unitsPerMeter;
      const style=massing.facadeStyle||[0,0,0,0x50565b];
      const vertex=(point,y,along,width)=>{
        positions.push(point.x,y,point.z);colors.push(...color);styles.push(...style);
        layouts.push(along,(y-baseY)/unitsPerMeter,width,heightMeters);
      };
      // Hard wall corners keep their own metre-space bays. Roof triangles do
      // not share interpolated wall normals/openings at the eaves.
      for(let i=0;i<footprint.length;i++){
        const a=footprint[i],b=footprint[(i+1)%footprint.length],at=positions.length/3;
        const width=Math.hypot(b.x-a.x,b.z-a.z)/unitsPerMeter;
        vertex(a,baseY,0,width);vertex(b,baseY,width,width);
        vertex(a,topY,0,width);vertex(b,topY,width,width);
        indices.push(at,at+1,at+2,at+2,at+1,at+3);
      }
      // The roof has its own vertices, separate from every wall, but its
      // coplanar triangles can share those vertices. Repeating three complete
      // attribute records per triangle retained redundant city-wide buffers.
      if(topTriangles.length){
        const at=positions.length/3;
        for(const point of footprint)vertex(point,topY,0,0);
        for(const triangle of topTriangles)indices.push(at+triangle[0],at+triangle[1],at+triangle[2]);
      }
}
