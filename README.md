# flood-risk-nairobi

**Flood Susceptibility Modelling — Nairobi Watershed, Kenya**  
A pilot study using satellite data, machine learning, and GIS to map flood susceptibility across the Nairobi Watershed at 30 m resolution.

---

## Overview

This repository contains the complete analytical pipeline for a flood susceptibility model developed for the Nairobi Watershed, Kenya. The study combines freely available global satellite datasets with open-source tools to produce a Flood Susceptibility Index (FSI) classified into five zones — Very Low to Very High — across the watershed.

The study was developed as a **proposal pilot**, demonstrating that evidence-based flood risk mapping is achievable for Nairobi with existing global data, while clearly identifying the data gaps that would need to be closed in a fully funded operational model.

---

## Repository Structure

```
flood-risk-nairobi/
│
├── gee/
│   └── flood_susceptibility_data_prep.js   # Google Earth Engine script
│
├── jupyter/
│   ├── 01_data_prep_and_modelling.ipynb    # Raster alignment, RF model, validation
│   └── 02_flood_hotspot_mapping.ipynb      # AHP weighted FSI, risk map, exports
│
├── qgis/
│   └── QGIS_workflow_notes.md              # Step-by-step QGIS + WhiteboxTools guide
│
├── docs/
│   ├── Flood_Model_Process_Documentation_v2.docx   # Full technical process record
│   └── Nairobi_Flood_Susceptibility_Report.docx    # High-level report for stakeholders
│
├── outputs/                                # Generated maps and rasters (not committed)
├── requirements.txt                        # Python dependencies
├── .gitignore
└── README.md
```

---

## Workflow

The pipeline runs in three stages:

```
Stage 1 — Google Earth Engine
    ↓  Export 11 GeoTIFFs + 1 CSV to Google Drive
Stage 2 — Jupyter Notebook
    ↓  Align → Normalise → Random Forest → Weighted FSI → Export rasters
Stage 3 — QGIS + WhiteboxTools
         DEM preprocessing → Stream network → Polygonize → LULC overlay
```

---

## Stage 1 — Google Earth Engine

**File:** `gee/flood_susceptibility_data_prep.js`

Paste this script into the [GEE Code Editor](https://code.earthengine.google.com). It processes and exports all required layers.

### Input datasets (all accessed via GEE)

| Dataset | Source | Resolution | Used for |
|---------|--------|-----------|----------|
| ALOS AW3D30 DEM | JAXA | 30 m | Elevation, slope, TWI |
| CHIRPS Daily Rainfall | UCSB-CHG | 5.5 km | Extreme rainfall (P95) |
| Sentinel-2 SR | ESA | 10 m | NDVI |
| ESA WorldCover v200 | ESA | 10 m | Land cover, distance layers |
| Sentinel-1 SAR GRD | ESA | 10 m | Flood label |
| SoilGrids | ISRIC | 250 m | Clay content |
| HydroSHEDS | WWF/USGS | 500 m | Flow accumulation (TWI) |
| Global Flood Database | Dartmouth | 250 m | Reference layer |

### Exported outputs (to Google Drive → `GEE_Exports/`)

```
rainfall_p95_nairobi.tif
dem_alos_nairobi.tif
slope_nairobi.tif
twi_nairobi.tif
ndvi_nairobi.tif
dist_to_river_nairobi.tif
dist_to_impervious_nairobi.tif
clay_nairobi.tif
landcover_nairobi.tif
flood_label_sar_nairobi.tif
flood_frequency_gfd_nairobi.tif
training_data_nairobi.csv
```

> **Note:** Update the watershed asset path on line 9 to point to your own GEE asset:
> ```javascript
> var watershed = ee.FeatureCollection("projects/YOUR-PROJECT/assets/YOUR-ASSET");
> ```

---

## Stage 2 — Jupyter Notebooks

### Setup

```bash
git clone https://github.com/[your-username]/flood-risk-nairobi.git
cd flood-risk-nairobi
pip install -r requirements.txt
```

### Notebook 1 — `01_data_prep_and_modelling.ipynb`

1. Update `DATA_DIR` to your local GEE exports folder
2. Runs raster alignment, normalisation, Random Forest training, SHAP analysis
3. Outputs: `RF_flood_probability_nairobi.tif`, `validation_plots.png`, `shap_importance.png`, `model_state.pkl`

### Notebook 2 — `02_flood_hotspot_mapping.ipynb`

1. Loads state from notebook 1 (`model_state.pkl`)
2. Applies AHP weights to compute the Flood Susceptibility Index
3. Classifies into 5 zones using percentile-based equal-frequency breaks
4. Generates the final flood risk map with hillshade overlay
5. Exports all GeoTIFF outputs for QGIS

### AHP Weights Used

| Factor | Weight | Direction |
|--------|--------|-----------|
| Rainfall (P95) | 0.2646 | High = higher risk |
| Elevation | 0.2255 | Low = higher risk |
| Distance to river | 0.1598 | Close = higher risk |
| Slope | 0.1211 | Flat = higher risk |
| TWI | 0.0904 | High = higher risk |
| NDVI | 0.0591 | Low = higher risk |
| Distance to impervious | 0.0467 | Close = higher risk |
| Clay content | 0.0328 | High = higher risk |

### Output rasters

```
FSI_continuous_nairobi.tif         # Continuous FSI (0-1) for smooth overlay
FSI_classes_final_nairobi.tif      # Integer classes 1-5 for polygonize in QGIS
FSI_high_risk_only_nairobi.tif     # High + Very High zones only
FSI_class_very_low_nairobi.tif     # Individual class TIFs (x5)
FSI_class_low_nairobi.tif
FSI_class_moderate_nairobi.tif
FSI_class_high_nairobi.tif
FSI_class_very_high_nairobi.tif
RF_flood_probability_nairobi.tif   # Random Forest flood probability
```

---

## Stage 3 — QGIS + WhiteboxTools

Full step-by-step instructions: [`qgis/QGIS_workflow_notes.md`](qgis/QGIS_workflow_notes.md)

### Summary of steps

1. **Fill DEM sinks** — WhiteboxTools → Fill Depressions (Wang & Liu)
2. **Flow direction** — WhiteboxTools → D8 Pointer
3. **Flow accumulation** — WhiteboxTools → D8 Flow Accumulation
4. **Extract streams** — WhiteboxTools → Extract Streams (threshold: 1000 cells)
5. **Vectorise streams** — QGIS Polygonize → river network shapefile
6. **Reclassify slope** — QGIS Reclassify by table (5 classes)
7. **Polygonize FSI** — QGIS Polygonize → flood hotspot polygons
8. **LULC overlay** — QGIS Intersection → flood exposure by land use

### QGIS symbology (flood zones)

| Class | Label | Hex |
|-------|-------|-----|
| 1 | Very Low | `#1a9850` |
| 2 | Low | `#91cf60` |
| 3 | Moderate | `#ffffbf` |
| 4 | High | `#fc8d59` |
| 5 | Very High | `#d73027` |

---

## Known Challenges and Limitations

### Data challenges

| Challenge | Impact | Recommended fix |
|-----------|--------|-----------------|
| CHIRPS rainfall at 5.5 km | Smooths out localised convective events | Rain gauge network or IMERG |
| GFD flood label too sparse (17 pixels) | Cannot train RF reliably | Field flood mapping campaign |
| SAR flood label threshold too strict (3 pixels) | Near-zero flood training samples | SLC SAR processing with Otsu threshold |
| SoilGrids at 250 m | Blocky soil approximation | Field soil sampling (50-100 sites) |
| ALOS DEM from 2006-2011 | Pre-dates major urban expansion | LiDAR survey or TanDEM-X |
| No ground truth validation | Cannot spatially validate the map | GPS flood extent surveys |

### Processing challenges

| Issue | Fix |
|-------|-----|
| GEE `stratifiedSample` memory limit | Separate `.sample()` per class at 90 m |
| `cumulativeCost` on wrong image | Use `cost_image.cumulativeCost({ source: mask })` |
| FSI map single dominant colour | Use percentile-based equal-frequency classification |
| WhiteboxTools no output | Remove spaces from path; ensure UTM projection |
| WorldCover polygonize crashes QGIS | Resample to 30 m (Mode) first |

---

## Deliverables

| Stage | Deliverable | Status |
|-------|------------|--------|
| DEM Preprocessing | Filled DEM | Requires WhiteboxTools |
| DEM Preprocessing | Flow Direction | Requires WhiteboxTools |
| DEM Preprocessing | Flow Accumulation | Requires WhiteboxTools |
| DEM Preprocessing | Streams | Requires WhiteboxTools |
| Hydrological Modelling | River networks | QGIS Polygonize + Strahler |
| Hydrological Modelling | Flow volumes | Zonal statistics on flow_acc |
| Hydrological Modelling | Water volumes per segment | Field Calculator |
| Terrain Analysis | Slope | ✅ GEE export |
| Terrain Analysis | Reclassified slope | QGIS Reclassify |
| Multi-Criteria Analysis | Flood hotspot zones (5 classes) | ✅ Jupyter notebook 2 |
| Multi-Criteria Analysis | Flood hotspot polygons | QGIS Polygonize |
| Multi-Criteria Analysis | Flood exposure (LULC overlay) | QGIS Intersection |

---

## Documents

| Document | Description |
|----------|-------------|
| `docs/Nairobi_Flood_Susceptibility_Report.docx` | High-level report: flood context, methodology, findings, funding case |
| `docs/Flood_Model_Process_Documentation_v2.docx` | Full technical process record including all data challenges and resolutions |

---

## Study Area

The study covers the **Nairobi Watershed** (EPSG:32737 — UTM Zone 37S), encompassing the major river basins that drain through Nairobi city including the Nairobi, Mathare, Ngong, and Gitathuru rivers.

**Analysis period:** 2022–2024  
**Output resolution:** 30 m  
**Projection:** UTM Zone 37S (EPSG:32737)

---

## Citation

If you use this work please cite:

```
[Your Name] (2024). Flood Susceptibility Modelling — Nairobi Watershed, Kenya.
GitHub: https://github.com/[your-username]/flood-risk-nairobi
```

---

## Licence

MIT Licence — see `LICENSE` for details.  
Data sources are subject to their respective provider licences (JAXA, ESA, UCSB-CHG, ISRIC, WWF).
