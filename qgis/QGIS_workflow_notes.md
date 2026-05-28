# QGIS + WhiteboxTools Workflow
## Flood Susceptibility Model — Nairobi Watershed

This document describes the QGIS processing steps performed after the GEE and Jupyter stages.

---

## Prerequisites

- QGIS 3.x LTR
- WhiteboxTools for Processing plugin (`Plugins → Manage and Install Plugins → search WhiteboxTools`)
- Input files from GEE exports: `dem_alos_nairobi.tif`, `slope_nairobi.tif`, `landcover_nairobi.tif`
- Output files from Jupyter: `FSI_classes_final_nairobi.tif`

---

## Stage 1 — DEM Preprocessing

### Critical: DEM must be in projected CRS before WhiteboxTools
All WhiteboxTools hydrology tools require metric units (metres).
Check: `Layer Properties → Information → CRS` must show `EPSG:32737`

If not, reproject first:
```
Processing Toolbox → GDAL → Raster projections → Warp (reproject)
  Input:            dem_alos_nairobi.tif
  Target CRS:       EPSG:32737
  Resampling:       Bilinear
  Output:           dem_alos_utm.tif
```

### Step 1 — Fill Depressions
```
Processing Toolbox → WhiteboxTools → Hydrological Analysis → Fill Depressions (Wang & Liu)
  Input DEM:   dem_alos_utm.tif
  Output:      dem_filled.tif

IMPORTANT: Output path must contain NO spaces or special characters
  GOOD: C:/GEE_Exports/dem_filled.tif
  BAD:  C:/GEE Exports/dem filled.tif
```

### Step 2 — Flow Direction (D8)
```
WhiteboxTools → Hydrological Analysis → D8 Pointer
  Input:   dem_filled.tif
  Output:  flow_dir.tif
```

### Step 3 — Flow Accumulation
```
WhiteboxTools → Hydrological Analysis → D8 Flow Accumulation
  Input:       dem_filled.tif
  Output type: cells
  Output:      flow_acc.tif
```

### Step 4 — Extract Streams
```
WhiteboxTools → Stream Network Analysis → Extract Streams
  Flow accumulation: flow_acc.tif
  Threshold:         1000  (adjust: lower = more streams, higher = fewer)
  Output:            streams.tif
```

### Step 5 — Vectorise Stream Network
```
Raster → Conversion → Polygonize (Raster to Vector)
  Input:  streams.tif
  Field:  DN
  Output: rivers_raw.shp

Vector → Geometry Tools → Multipart to Singleparts
  Input:  rivers_raw.shp
  Output: rivers.shp

Vector → Research Tools → Select by Expression: "DN" = 0 → Delete selected → Save
```

---

## Stage 2 — Terrain Analysis

### Slope Reclassification
```
Processing Toolbox → QGIS → Raster Analysis → Reclassify by table
  Input: slope_nairobi.tif

Reclassification table:
  Min    Max    Value
  0      5      5   (Very Flat — highest risk)
  5      10     4
  10     15     3
  15     25     2
  25     90     1   (Very Steep — lowest risk)

Output: slope_reclassified.tif
```

---

## Stage 3 — Hydrological Modelling

### Strahler Stream Order
```
WhiteboxTools → Stream Network Analysis → Strahler Stream Order
  D8 pointer: flow_dir.tif
  Streams:    streams.tif
  Output:     strahler_order.tif
```

### Flow Volumes (Zonal Statistics on rivers)
```
Processing Toolbox → QGIS → Raster Analysis → Zonal Statistics
  Input raster:    flow_acc.tif
  Vector layer:    rivers.shp
  Statistics:      Sum, Mean, Max
```

Open attribute table → Field Calculator:

```
New field: flow_vol_m3  (Decimal)
Expression: "_sum" * 900

New field: drain_km2  (Decimal)
Expression: "_sum" * 900 / 1000000

New field: water_vol_m3  (Decimal)
Expression: "drain_km2" * 1000000 * (550 / 1000)
  (replace 550 with your actual mean annual rainfall in mm from CHIRPS)
```

---

## Stage 4 — Multi-Criteria Analysis

### Polygonize Flood Susceptibility Classes
```
Raster → Conversion → Polygonize (Raster to Vector)
  Input:  FSI_classes_final_nairobi.tif
  Field:  class
  Output: flood_zones_raw.shp

Vector → Geoprocessing → Dissolve
  Input:          flood_zones_raw.shp
  Dissolve field: class
  Output:         flood_hotspot_polygons.shp
```

Add labels in Field Calculator:
```
New field: susceptibility  (Text, length 20)
Expression:
  CASE
  WHEN "class" = 1 THEN 'Very Low'
  WHEN "class" = 2 THEN 'Low'
  WHEN "class" = 3 THEN 'Moderate'
  WHEN "class" = 4 THEN 'High'
  WHEN "class" = 5 THEN 'Very High'
  END
```

### LULC Flood Exposure Overlay
```
# Step 1: Resample landcover to 30m (Mode = correct for categorical data)
Processing Toolbox → GDAL → Raster Analysis → Warp (reproject)
  Input:              landcover_nairobi.tif
  Target CRS:         EPSG:32737
  Resampling method:  Mode
  Output resolution:  30
  Output:             landcover_30m.tif

# Step 2: Polygonize
Raster → Conversion → Polygonize
  Input:  landcover_30m.tif
  Field:  lulc_code
  Output: landcover_vector.shp

# Step 3: Dissolve
Vector → Geoprocessing → Dissolve
  Field:  lulc_code
  Output: landcover_dissolved.shp

# Step 4: Add LULC class names in Field Calculator
New field: lulc_name (Text)
  CASE
  WHEN "lulc_code" = 10  THEN 'Tree cover'
  WHEN "lulc_code" = 20  THEN 'Shrubland'
  WHEN "lulc_code" = 30  THEN 'Grassland'
  WHEN "lulc_code" = 40  THEN 'Cropland'
  WHEN "lulc_code" = 50  THEN 'Built-up'
  WHEN "lulc_code" = 60  THEN 'Bare/sparse vegetation'
  WHEN "lulc_code" = 80  THEN 'Permanent water'
  WHEN "lulc_code" = 90  THEN 'Herbaceous wetland'
  END

# Step 5: Intersection
Vector → Geoprocessing → Intersection
  Input:   flood_hotspot_polygons.shp
  Overlay: landcover_dissolved.shp
  Output:  flood_exposure.shp

# Step 6: Area calculation
Field Calculator → New field: area_km2 (Decimal)
  Expression: $area / 1000000
```

---

## Symbology

Apply this colour scheme to `flood_hotspot_polygons.shp`:
```
Layer Properties → Symbology → Categorized → Column: class

Value  Label       Hex colour
1      Very Low    #1a9850
2      Low         #91cf60
3      Moderate    #ffffbf
4      High        #fc8d59
5      Very High   #d73027
```

---

## Known Issues and Fixes

| Issue | Fix |
|-------|-----|
| Fill Depressions produces no output | Remove spaces from output path; ensure DEM is in EPSG:32737 |
| Watershed tool fails with polygon pour point | Use point shapefile; snap to flow accumulation first |
| Polygonize crashes QGIS on 10m raster | Resample to 30m using Mode before polygonizing |
| Sample Raster Values crashes on line layer | Extract vertices to points first, sample, then join back |
