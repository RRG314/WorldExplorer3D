import {canonicalPoiId} from '../poi/semantic-authority.js?v=3';
// Shared immutable classification: map drawing checks every POI repeatedly.
// Constructing this table inside the predicate allocates one copy per marker.
const POI_MAP_CATEGORIES = Object.freeze({
    'amenity=school': 'schools',
    'amenity=university': 'schools',
    'amenity=hospital': 'healthcare',
    'amenity=clinic': 'healthcare',
    'amenity=pharmacy': 'healthcare',
    'amenity=police': 'emergency',
    'amenity=fire_station': 'emergency',
    'amenity=restaurant': 'food',
    'amenity=cafe': 'food',
    'amenity=fast_food': 'food',
    'amenity=bar': 'food',
    'amenity=pub': 'food',
    'shop=supermarket': 'shopping',
    'shop=mall': 'shopping',
    'shop=convenience': 'shopping',
    'shop=hardware': 'shopping',
    'shop=doityourself': 'shopping',
    'shop=pawnbroker': 'shopping',
    'shop=second_hand': 'shopping',
    'shop=car_repair': 'shopping',
    'shop=car_parts': 'shopping',
    'shop=outdoor': 'shopping',
    'shop=fishing': 'shopping',
    'shop=boat': 'shopping',
    'shop=aviation': 'shopping',
    'tourism=museum': 'culture',
    'tourism=attraction': 'tourism',
    'tourism=viewpoint': 'tourism',
    'tourism=hotel': 'hotels',
    'tourism=artwork': 'culture',
    'historic=monument': 'historic',
    'historic=memorial': 'historic',
    'leisure=park': 'parks',
    'leisure=playground': 'parks',
    'leisure=sports_centre': 'parks',
    'leisure=stadium': 'parks',
    'amenity=parking': 'parking',
    'amenity=fuel': 'fuel',
    'amenity=charging_station': 'fuel',
    'amenity=bank': 'banks',
    'amenity=post_office': 'postal'
});

export function isPoiMapLayerVisible(poiType, mapLayers) {
  const category = POI_MAP_CATEGORIES[poiType];
  return category ? mapLayers[category] : false;
}


// Only a published entrance to an admitted, furnished business is advertised
// as a playable POI. Reference records remain in the location data/catalog.
export function playablePoiTarget(poi, lifecycle, entranceByBuilding) {
  const id=canonicalPoiId(poi);
  const record=lifecycle?.byId?.get(id);
  const association=record?.buildingAssociation;
  if(!record?.semantic?.interiorArchetype||!association?.enterable)return null;
  const entrance=entranceByBuilding?.get?.(association.sourceBuildingId);
  if(!entrance)return null;
  const x=Number(entrance.approachX??entrance.x),z=Number(entrance.approachZ??entrance.z);
  return Number.isFinite(x)&&Number.isFinite(z)?{x,z,sourceBuildingId:association.sourceBuildingId,program:record.semantic.interiorArchetype,poiId:id}:null;
}
