// DATA PREPARATION
// Study Area: Nairobi Watershed

// 1️ LOAD STUDY AREA
var watershed = ee.FeatureCollection(
  "projects/ee-wonyancha22/assets/Watershed_37s_wgs84"
);
var aoi = watershed.geometry();
Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'red'}, 'Watershed Boundary');

// 2️ RAINFALL (CHIRPS)
var startDate = '2022-01-01';
var endDate   = '2024-12-31';

var chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
  .filterDate(startDate, endDate)
  .filterBounds(aoi);

var rainfall_mean = chirps.mean()
  .rename('rain_mean')
  .clip(aoi);

var rainfall_p95 = chirps
  .reduce(ee.Reducer.percentile([95]))
  .rename('rain_p95')
  .clip(aoi);

var rainfall_max = chirps.max()
  .rename('rain_max')
  .clip(aoi);

Map.addLayer(rainfall_mean,
  {min:0, max:15, palette:['white','blue','purple']},
  'Mean Rainfall');
Map.addLayer(rainfall_p95,
  {min:20, max:80, palette:['yellow','red']},
  '95th Percentile Rainfall');

print('CHIRPS image count:', chirps.size());

// 3️ DEM — ALOS World 3D (AW3D30) ~30m
// Switched from Copernicus GLO-30 for better resolution in Nairobi
var alos_collection = ee.ImageCollection("JAXA/ALOS/AW3D30/V3_2")
  .filterBounds(aoi)
  .select('DSM');

print('ALOS DEM tile count:', alos_collection.size());

// Mosaic & clip for display and stats
var dem_clipped = alos_collection
  .mosaic()
  .clip(aoi)
  .rename('elevation');

// Reproject to UTM 37S for terrain derivatives only
var dem = dem_clipped.reproject({
  crs: 'EPSG:32737',
  scale: 30
});

print('DEM projection:', dem.projection());
print('DEM stats:', dem_clipped.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), '', true),
  geometry: aoi,
  scale: 30,
  maxPixels: 1e13,
  bestEffort: true
}));

// Display dem_clipped not dem — reproject causes blank tiles in viewer
Map.addLayer(dem_clipped,
  {min:1400, max:2500,
   palette:['#006837','#78c679','#d9f0a3','#c8a46e','#8c510a','white']},
  'ALOS DEM 30m');

// Hillshade — fastest way to confirm DEM loaded correctly
var hillshade = ee.Terrain.hillshade(dem_clipped, 315, 45);
Map.addLayer(hillshade, {min:100, max:250}, 'Hillshade (DEM check)');

// 4️ TERRAIN DERIVATIVES
var slope  = ee.Terrain.slope(dem).rename('slope');
var aspect = ee.Terrain.aspect(dem).rename('aspect');

Map.addLayer(slope,
  {min:0, max:30, palette:['white','orange','red']},
  'Slope (degrees)');
Map.addLayer(aspect,
  {min:0, max:360, palette:['blue','green','yellow','red','blue']},
  'Aspect');

print('Slope stats:', slope.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: aoi,
  scale: 30,
  maxPixels: 1e13
}));

// 5️ TWI (Topographic Wetness Index)
// HydroSHEDS flow accumulation (15 arc-sec)
var hydrosheds_acc = ee.Image("WWF/HydroSHEDS/15ACC")
  .select('b1')
  .rename('flow_acc')
  .clip(aoi);

var flow_acc = hydrosheds_acc.reproject({
  crs: 'EPSG:32737',
  scale: 30
});

// TWI = ln(flow_acc / tan(slope_radians))
var slope_rad = slope.multiply(Math.PI / 180);
var tan_slope = slope_rad.tan().max(ee.Image(0.001)); // avoid ln(0)

var twi = flow_acc.divide(tan_slope)
  .log()
  .rename('twi')
  .clip(aoi);

Map.addLayer(twi,
  {min:2, max:14, palette:['white','cyan','blue','darkblue']},
  'TWI');

print('TWI stats:', twi.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: aoi,
  scale: 30,
  maxPixels: 1e13
}));

// 6️ SOIL — Clay Content (SoilGrids)
var soil_clay = ee.Image("projects/soilgrids-isric/clay_mean")
  .select('clay_0-5cm_mean')
  .rename('clay')
  .clip(aoi);

Map.addLayer(soil_clay,
  {min:0, max:60, palette:['yellow','brown']},
  'Clay Content (%)');

// 7️ LAND COVER (ESA WorldCover 10m)
var worldcover = ee.ImageCollection("ESA/WorldCover/v200")
  .first()
  .clip(aoi)
  .rename('landcover');

Map.addLayer(worldcover, {}, 'Land Cover (ESA WorldCover)');

print('Landcover histogram:', worldcover.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: aoi,
  scale: 30,
  maxPixels: 1e13
}));

// 8 NDVI (Sentinel-2 SR)
function maskS2clouds(image) {
  var scl  = image.select('SCL');
  var mask = scl.neq(3)   // cloud shadow
    .and(scl.neq(8))      // medium cloud
    .and(scl.neq(9))      // high cloud
    .and(scl.neq(10));    // thin cirrus
  return image.updateMask(mask);
}

var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterDate(startDate, endDate)
  .filterBounds(aoi)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(maskS2clouds)
  .median()
  .clip(aoi);

var ndvi = s2.normalizedDifference(['B8','B4']).rename('ndvi');

Map.addLayer(ndvi,
  {min:-0.1, max:0.7, palette:['brown','yellow','green','darkgreen']},
  'NDVI (Sentinel-2)');

print('NDVI stats:', ndvi.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(),'',true),
  geometry: aoi,
  scale: 30,
  maxPixels: 1e13
}));

// 9 DISTANCE TO RIVERS
var water_mask = worldcover.eq(80).selfMask();
var cost_image = ee.Image(1).clip(aoi);

var dist_to_water = cost_image.cumulativeCost({
  source: water_mask,
  maxDistance: 10000,
  geodeticDistance: true
})
.rename('dist_to_river')
.clip(aoi);

Map.addLayer(dist_to_water,
  {min:0, max:5000, palette:['blue','cyan','white']},
  'Distance to River (m)');

// 10 DISTANCE TO IMPERVIOUS SURFACE
var impervious_mask = worldcover.eq(50).selfMask();

var dist_to_impervious = cost_image.cumulativeCost({
  source: impervious_mask,
  maxDistance: 5000,
  geodeticDistance: true
})
.rename('dist_impervious')
.clip(aoi);

Map.addLayer(dist_to_impervious,
  {min:0, max:3000, palette:['red','orange','yellow','white']},
  'Distance to Impervious (m)');

// 11 FLOOD LABEL — Sentinel-1 SAR
// Replaces GFD (too coarse/sparse for Nairobi watershed)
// Compares dry baseline vs wet/flood season backscatter
var s1_dry = ee.ImageCollection("COPERNICUS/S1_GRD")
  .filterBounds(aoi)
  .filterDate('2024-01-01', '2024-02-28')   // dry baseline
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .select('VV')
  .mean()
  .clip(aoi);

var s1_wet = ee.ImageCollection("COPERNICUS/S1_GRD")
  .filterBounds(aoi)
  .filterDate('2024-03-01', '2024-05-31')   // long rains / flood season
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .select('VV')
  .mean()
  .clip(aoi);

// Flood = significant backscatter drop (water absorbs radar signal)
var sar_diff = s1_dry.subtract(s1_wet).rename('backscatter_diff');

// Mask out permanent water and steep slopes — they are not flood events
var permanent_water = worldcover.eq(80);
var steep           = slope.gt(10);

// Threshold: > 3 dB drop = flooded pixel
var flood_label_s1 = sar_diff.gt(3)
  .and(permanent_water.not())
  .and(steep.not())
  .rename('label')
  .clip(aoi);

Map.addLayer(s1_dry,
  {min:-25, max:0},
  'S1 Dry Season (VV dB)');
Map.addLayer(s1_wet,
  {min:-25, max:0},
  'S1 Wet Season (VV dB)');
Map.addLayer(sar_diff,
  {min:0, max:8, palette:['white','cyan','blue']},
  'SAR Backscatter Difference');
Map.addLayer(flood_label_s1.selfMask(),
  {palette:['red']},
  'SAR Flood Extent (label=1)');

// Check label balance — critical before sampling
var label_check = flood_label_s1.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: aoi,
  scale: 500,
  maxPixels: 1e13
});
print('SAR flood label counts (0=non-flood, 1=flood):', label_check);

// Also keep GFD as a reference band (not used as label)
var flood_freq = ee.ImageCollection("GLOBAL_FLOOD_DB/MODIS_EVENTS/V1")
  .filterBounds(aoi)
  .select('flooded')
  .sum()
  .rename('flood_frequency')
  .clip(aoi);

Map.addLayer(flood_freq,
  {min:0, max:7, palette:['white','lightblue','blue','darkblue','purple']},
  'Historical Flood Frequency (GFD reference)');

// 12 DATA QUALITY SUMMARY
print('--- DATA QUALITY SUMMARY ---');
print('CHIRPS image count:', chirps.size());
print('DEM stats:', dem_clipped.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(),'',true),
  geometry: aoi, scale: 30, maxPixels: 1e13, bestEffort: true
}));
print('Slope stats:', slope.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: aoi, scale: 30, maxPixels: 1e13
}));
print('TWI stats:', twi.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: aoi, scale: 30, maxPixels: 1e13
}));
print('NDVI stats:', ndvi.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(),'',true),
  geometry: aoi, scale: 30, maxPixels: 1e13
}));
print('SAR label balance:', label_check);

// 13 TRAINING SAMPLE (memory-safe)
// All rasters normalised in Jupyter
var sample_stack = rainfall_p95
  .addBands(dem_clipped)
  .addBands(slope)
  .addBands(twi)
  .addBands(ndvi)
  .addBands(dist_to_water)
  .addBands(dist_to_impervious)
  .addBands(soil_clay)
  .addBands(worldcover)
  .addBands(flood_label_s1);  // SAR-derived label

// Sample flooded pixels
var flooded_sample = sample_stack
  .updateMask(flood_label_s1.eq(1))
  .sample({
    region: aoi,
    scale: 90,        // 90m avoids memory limit; fine for ~1000 point RF
    numPixels: 500,
    seed: 42,
    geometries: false
  });

// Sample non-flooded pixels
var non_flooded_sample = sample_stack
  .updateMask(flood_label_s1.eq(0))
  .sample({
    region: aoi,
    scale: 90,
    numPixels: 500,
    seed: 123,
    geometries: false
  });

var training_sample = flooded_sample.merge(non_flooded_sample);

print('Training sample total size:', training_sample.size());
print('Training feature names:', training_sample.first().propertyNames());

// 14 EXPORTS
function exportLayer(image, name) {
  Export.image.toDrive({
    image: image.toFloat(),
    description: name,
    fileNamePrefix: name,
    region: aoi,
    scale: 30,
    crs: 'EPSG:32737',
    maxPixels: 1e13,
    folder: 'flood_project'
  });
}

// Individual raster layers for Jupyter stacking
exportLayer(dem_clipped,        'dem_alos_nairobi');        // switched to ALOS
exportLayer(slope,              'slope_nairobi');
exportLayer(twi,                'twi_nairobi');
exportLayer(rainfall_p95,       'rainfall_p95_nairobi');
exportLayer(ndvi,               'ndvi_nairobi');
exportLayer(dist_to_water,      'dist_to_river_nairobi');
exportLayer(dist_to_impervious, 'dist_to_impervious_nairobi');
exportLayer(soil_clay,          'clay_nairobi');
exportLayer(worldcover,         'landcover_nairobi');
exportLayer(flood_label_s1,     'flood_label_sar_nairobi'); // SAR flood label raster
exportLayer(flood_freq,         'flood_frequency_gfd_nairobi'); // GFD kept as reference

// Training CSV for Random Forest in Jupyter
Export.table.toDrive({
  collection: training_sample,
  description: 'training_data_nairobi',
  folder: 'GEE_Exports',
  fileNamePrefix: 'training_data_nairobi',
  fileFormat: 'CSV'
});