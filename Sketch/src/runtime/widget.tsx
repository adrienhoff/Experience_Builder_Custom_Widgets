import { type AllWidgetProps, jsx, React } from 'jimu-core';
import { JimuLayerView, JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import FeatureForm from "@arcgis/core/widgets/FeatureForm";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";



interface State {
  jimuMapView: JimuMapView;
  sketchViewModel: SketchViewModel;
  selectedLayer: FeatureLayer | null;
  availableLayers: FeatureLayer[];
  previewGraphic: Graphic | null;
  tempGraphicsLayer: GraphicsLayer;
  isDrawingPolygon: boolean;
  isDrawingPoint: boolean;
  editorVisible: boolean;
  selectedGraphic: Graphic | null;
  activeDrawMode: 'polygon' | 'freehand' | 'point' | null;
}


export default class Widget extends React.PureComponent<AllWidgetProps<unknown>, State> {
  private readonly myRef = React.createRef<HTMLDivElement>();

  constructor(props) {
    super(props);
    this.featureFormRef = React.createRef();
    this.state = {
      jimuMapView: null,
      sketchViewModel: null,
      selectedLayer: null,
      availableLayers: [],
      previewGraphic: null,
      tempGraphicsLayer: new GraphicsLayer(),
      isDrawingPolygon: false,
      editorVisible: false,
      selectedGraphic: null,
      isDrawingPoint: null
    };
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleEscKey);
    
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleEscKey);
  }
  

  componentDidUpdate() {
    if (this.props.state === 'CLOSED') {
      console.log("Widget is closed - canceling draw mode");
      if (this.state.sketchViewModel) {
        this.state.sketchViewModel.cancel();
        this.state.sketchViewModel.destroy();
      }
  
      if (this.state.tempGraphicsLayer) {
        this.state.tempGraphicsLayer.removeAll();
      }
  
      this.setState({ 
        previewGraphic: null,
        isDrawingActive: false,
        isDrawingPolygon: false,
        activeDrawMode: null,
        sketchViewModel: null
      });
  
      if (this.state.jimuMapView) {
        this.state.jimuMapView.view.cursor = 'default';
      }
    }
  }
  

  cleanupFeatureForm = () => {
    if (this.featureFormRef.current) {
      this.featureFormRef.current.destroy();
      this.featureFormRef.current = null;
    }
  };

  handleClose = () => {

    if (this.cleanupReshape) {
      this.cleanupReshape();
      this.cleanupReshape = null;
    }

    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.cancel();
    }
        
  
    this.cleanupFeatureForm();
    this.state.tempGraphicsLayer.removeAll();

        
   
    
    this.setState({
      editorVisible: false,
      selectedGraphic: null,
      previewGraphic: null,
      isDrawingActive: false,
      isDrawingPolygon: false,
      activeDrawMode: null
    });
  };

  

  launchFeatureFormWidget = async (container, feature = null) => {
    const { jimuMapView, selectedGraphic } = this.state;
    
    if (!container || !jimuMapView) {
        console.error("Missing container or map view.");
        return;
    }

    this.cleanupFeatureForm();
    container.innerHTML = '';

    // Use either the passed feature, selectedGraphic, or return if neither exists
    const targetFeature = feature || selectedGraphic;
    if (!targetFeature) {
        console.error("No feature available for form.");
        return;
    }

    const featureLayer = targetFeature.layer || this.state.selectedLayer;
    if (!featureLayer) {
        console.error("No layer available for feature form.");
        return;
    }

    const fields = featureLayer.fields;

    const formTemplate = {
        elements: [
            {
                type: "group",
                label: "Attributes",
                elements: fields
                    .filter(field => !["Shape__Area", "Shape__Length", "OBJECTID", "GlobalID"].includes(field.name))
                    .map(field => ({
                        type: "field",
                        fieldName: field.name,
                        label: field.alias || field.name,
                        editable: true, // Make all fields editable for new features
                        required: field.nullable === false
                    }))
            }
        ]
    };

    const featureForm = new FeatureForm({
        container: container,
        layer: featureLayer,
        feature: targetFeature,
        formTemplate: formTemplate,
    });

    this.featureFormRef.current = featureForm;

    // Enable form editing
    featureForm.on("value-change", (event) => {
        console.log("Form value changed:", event);
    });
};


  initializeSketchViewModel = (view, mode) => {
    view.map.add(this.state.tempGraphicsLayer);

    const getAllFeatureLayers = (layerCollection) => {
        const featureLayers = [];
        layerCollection.forEach((layer) => {
            if (layer.type === "group") {
                featureLayers.push(...getAllFeatureLayers(layer.layers));
            } else if (
                layer.type === "feature" &&
                [
                    "National FireGuard Service",
                    "FireGuard Archive",
                    "BC Perimeter Feed",
                    "FireGuard_Analysts_Canadian",
                    "Active Wildfire Perimeters in Canada",
                    "WFIGS Current Interagency Fire Perimeters",
                ].includes(layer.title)
            ) {
                featureLayers.push(layer);
            }
        });
        return featureLayers;
    };

    const allFeatureLayers = mode === "polygon" ? getAllFeatureLayers(view.map.layers) : [];

    const config = {
        view,
        layer: this.state.tempGraphicsLayer,
        updateOnGraphicClick: true,
        defaultCreateOptions: {
            mode: mode === "freehand" ? "freehand" : "click",
            hasZ: false,
        },
        tooltipOptions: {
            enabled: true,
            visibleElements: {
                area: false,
                distance: true,
                direction: true,
            },
        },
        snappingOptions:
            mode !== "freehand"
                ? {
                      enabled: true,
                      distance: 25,
                      featureSources: allFeatureLayers.map((layer) => ({
                          layer,
                          enabled: true,
                      })),
                  }
                : null,
    };

    const sketchViewModel = new SketchViewModel(config);
    let tempGraphic = null;
    let areaLabel = null;

    sketchViewModel.on("create", (event) => {
        if (event.state === "active" && event.tool === "polygon") {
            if (event.graphic && event.graphic.geometry) {
                const areaMeters = geometryEngine.geodesicArea(event.graphic.geometry, "square-meters");
                const areaAcres = (areaMeters / 4046.86).toFixed(2);

                if (!areaLabel) {
                    areaLabel = document.createElement("div");
                    areaLabel.style.position = "absolute";
                    areaLabel.style.background = "rgba(0,0,0,0.7)";
                    areaLabel.style.color = "white";
                    areaLabel.style.padding = "5px";
                    areaLabel.style.borderRadius = "5px";
                    areaLabel.style.pointerEvents = "none";
                    document.body.appendChild(areaLabel);
                }

                const screenPoint = view.toScreen(event.graphic.geometry.extent.center);
                areaLabel.style.left = `${screenPoint.x + 10}px`;
                areaLabel.style.top = `${screenPoint.y + 10}px`;
                areaLabel.innerText = `Area: ${areaAcres} acres`;
            }
        }

        if (event.state === "complete") {
            if (areaLabel) {
                areaLabel.remove();
                areaLabel = null;
            }

            tempGraphic = event.graphic;
            
            this.state.tempGraphicsLayer.add(tempGraphic);

            const dummyFeature = new Graphic({
                geometry: tempGraphic.geometry,
                attributes: {},
                layer: this.state.selectedLayer
            });

            this.setState({
                selectedFeature: dummyFeature,
                previewGraphic: tempGraphic,
                editorVisible: true,
                isSubmitted: false,
                isDrawingActive: false,
                isDrawingPolygon: false,
                isDrawingPoint: false,
            }, () => {
                setTimeout(() => {
                    const container = document.querySelector(".feature-form-container");
                    if (container) {
                        this.launchFeatureFormWidget(container, dummyFeature);
                    }
                }, 100);
            });
        } else if (event.state === "cancel") {
            this.setState({
                previewGraphic: null,
                isDrawingPolygon: false,
                isDrawingPoint: false,
            });
            this.state.tempGraphicsLayer.removeAll();
            if (areaLabel) {
                areaLabel.remove();
                areaLabel = null;
            }
        }
    });

    sketchViewModel.on("update", (event) => {
        if (event.state === "complete" && event.graphics.length > 0) {
            const selectedFeature = event.graphics[0];
            this.setState({ selectedFeature });
            console.log("Feature updated:", selectedFeature);
        }
    });

    this.setState({ sketchViewModel });
};


  


startDrawing = (mode: 'polygon' | 'freehand' | 'point') => {
  if (this.state.sketchViewModel) {
    this.state.sketchViewModel.cancel();
    
    
    this.state.tempGraphicsLayer.removeAll();
    
    this.setState({ 
      isDrawingPolygon: mode !== 'point',
      isDrawingPoint: mode === 'point',
      previewGraphic: null 
    }, () => {
      this.state.tempGraphicsLayer.removeAll();
      this.state.jimuMapView.view.cursor = 'default';
  
      this.state.sketchViewModel.create(mode === 'point' ? 'point' : 'polygon', { 
        mode: mode === 'freehand' ? 'freehand' : 'click' 
      });
    });
  }
};



startReshapeTempGraphic = () => {
  const { sketchViewModel, tempGraphicsLayer } = this.state;

  if (sketchViewModel && tempGraphicsLayer.graphics.length > 0) {
    const graphicToEdit = tempGraphicsLayer.graphics.getItemAt(0); 
    sketchViewModel.update([graphicToEdit], {
      tool: 'transform',
      enableScaling: true,
      enableRotation: true,
      preserveAspectRatio: false,
    });
    console.log('Editing vertices of the temp graphics layer graphic.');
  } else {
    console.warn('No temporary graphic available for reshaping.');
  }
};


  handleCancelPolygon = () => {
    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.cancel();
      this.state.tempGraphicsLayer.removeAll();
      this.setState({ previewGraphic: null });
  }

    if (this.state.tempGraphicsLayer) {
        this.state.tempGraphicsLayer.removeAll();
    }

    this.setState({
        previewGraphic: null,  
        isDrawingPolygon: false, 
        isDrawingActive: false,
        activeDrawMode: null
    });
  };


  getFeatureLayers = (layers, groupNameFilter: string) => {
    const featureLayers: FeatureLayer[] = [];
    
    layers.forEach((layer) => {
      if (layer.type === 'group') {
        if (layer.title === groupNameFilter) {
          featureLayers.push(...this.getFeatureLayers(layer.layers, groupNameFilter));
        }
      } else if (layer.type === 'feature' && (layer.title === 'National FireGuard Service' || layer.title === 'point' || layer.title === 'FireGuard Reference Points' || layer.title === 'FireGuard_Analysts_Canadian' || layer.title === 'FireGuard Canadian Reference Points')) {
        featureLayers.push(layer as FeatureLayer);
      }
    });
  
    return featureLayers;
  };
  

/*   getFeatureLayers = (layers) => {
    const featureLayers: FeatureLayer[] = [];
  
    layers.forEach((layer) => {
      if (layer.type === 'group') {
        // Recursively check sublayers
        featureLayers.push(...this.getFeatureLayers(layer.layers));
      } else if (layer.type === 'feature') {
        // Check if the layer is editable before adding it
        if (layer.editingEnabled) {
          featureLayers.push(layer as FeatureLayer);
        }
      }
    });
  
    return featureLayers;
  };
   */

  activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      const groupNameFilter = 'Analyst Layers';
      const featureLayers = this.getFeatureLayers(jmv.view.map.layers, groupNameFilter); 

      this.setState({
        jimuMapView: jmv,
        availableLayers: featureLayers,
      });

      this.initializeSketchViewModel(jmv.view, 'polygon');
    }
  };

 /*  activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      const featureLayers = this.getFeatureLayers(jmv.view.map.layers); 
  
      this.setState({
        jimuMapView: jmv,
        availableLayers: featureLayers,  // Automatically includes all editable layers
      });
  
      this.initializeSketchViewModel(jmv.view, 'polygon');
    }
  };
   */

  const initializeReshapeSketchVM = (view: __esri.MapView, selectedFeature: __esri.Graphic) => {
    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.destroy();
      this.setState({ sketchViewModel: null });
    }
  
    const graphicsLayer = new GraphicsLayer({ listMode: "hide" });
    view.map.add(graphicsLayer);
  
    const clonedFeature = selectedFeature.clone();
    graphicsLayer.add(clonedFeature);
  
    const sketchVM = new SketchViewModel({
      view: view,
      layer: graphicsLayer,
      defaultUpdateOptions: {
        tool: "reshape",
        toggleToolOnClick: false,
        enableRotation: true,
        enableScaling: true,
        preserveAspectRatio: false,
        multipleSelectionEnabled: false,
      },
      defaultCreateOptions: {
        mode: "click",
      },
      updateOnGraphicClick: true,
      snappingOptions: {
        enabled: true,
        distance: 15,
        featureSources: [
          {
            layer: selectedFeature.layer,
            enabled: true,
          },
        ],
      },
    });
  
    sketchVM.on("update", (updateEvent) => {
      if (updateEvent.state === "active" || updateEvent.state === "complete") {
        if (updateEvent.graphics.length > 0) {
          this.latestPendingGraphic = new Graphic({
            geometry: updateEvent.graphics[0].geometry,
            attributes: selectedFeature.attributes,
            layer: selectedFeature.layer,
          });
        }
      }
    });
  
    //remove close out when clicked away.

    /* const cleanup = () => {
      if (sketchVM) {
        sketchVM.cancel();
        sketchVM.destroy();
      }
      graphicsLayer.remove(clonedFeature);
      view.map.remove(graphicsLayer);
      this.latestPendingGraphic = null;
    };
  
    const clickHandler = view.on("click", (event) => {
      const screenPoint = { x: event.x, y: event.y };
      
      view.hitTest(screenPoint).then((response) => {
        const result = response.results.find((r) => r.graphic === clonedFeature);
        
        if (!result) {
          cleanup();
          clickHandler.remove();
          this.handleClose();
        }
      });
    }); */
  
    sketchVM.update([clonedFeature], {
      tool: "reshape",
      enableRotation: true,
      enableScaling: true,
      preserveAspectRatio: false,
    });
  
    this.cleanupReshape = cleanup;
  
    this.setState({ sketchViewModel: sketchVM });
  };
  
  private commitPendingChanges = async () => {
    if (!this.latestPendingGraphic) {
      console.log("No pending changes to commit");
      return;
    }
  
    try {
      const result = await this.latestPendingGraphic.layer.applyEdits({
        updateFeatures: [this.latestPendingGraphic]
      });
  
      if (result.updateFeatureResults?.[0]?.success) {
        console.log("Changes committed successfully");
      } else {
        console.error("Failed to commit changes:", result.updateFeatureResults?.[0]?.error);
      }
    } catch (error) {
      console.error("Error committing changes:", error);
      throw error;
    } finally {
      this.latestPendingGraphic = null;
    }
  };
  
    
  

  handleSelectFeature = (layerId: string) => {
    const layer = this.state.jimuMapView?.view.map.findLayerById(layerId) as FeatureLayer;
    if (!layer || !this.state.jimuMapView) return;
  
    const view = this.state.jimuMapView.view;
    layer.popupEnabled = false; 
    
  
    const clickHandler = view.on("click", async (event) => {
      const screenPoint = { x: event.x, y: event.y };
  
      try {
        const response = await view.hitTest(screenPoint);
        const result = response.results.find((result) => 
          result.graphic.layer === layer && 
          result.graphic.geometry
        );
  
        if (result) {
          //clickHandler.remove();
  
          const selectedFeature = result.graphic;

          const query = layer.createQuery();
          query.objectIds = [selectedFeature.attributes[layer.objectIdField]];
          query.outFields = ["*"];
          const queryResult = await layer.queryFeatures(query);

          if (queryResult.features.length > 0) {
            const fullyPopulatedGraphic = queryResult.features[0];
  
          await new Promise<void>(resolve => {
            this.setState(
              {
                selectedGraphic: fullyPopulatedGraphic,
                editorVisible: !this.state.editorVisible
                isSubmitted: false,
                previewGraphic: null,
                isDrawingActive: false,
                isDrawingPolygon: false
              }, () => {

                
                setTimeout(() => {
                  const container = document.querySelector('.feature-form-container');
                  if (container) {
                    this.launchFeatureFormWidget(container);
                  }
                }, 0);
                resolve();
              });
  
              this.initializeReshapeSketchVM(view, selectedFeature);
            }
          );
        } else {
          console.log("No feature selected at clicked location.");
        }
      } catch (error) {
        console.error("Error selecting feature:", error);
      } finally {
        layer.popupEnabled = true;
        clickHandler.remove();
      }
    });
  };


  

  getLayerSymbol = (layer: FeatureLayer) => {
    if (!layer) return null;

    try {
      const renderer = layer.renderer as any;
      let symbol;

      if (renderer.type === 'simple') {
        symbol = renderer.symbol;
      } else if (renderer.type === 'unique-value') {
        symbol = renderer.defaultSymbol || (renderer.uniqueValueInfos[0] && renderer.uniqueValueInfos[0].symbol);
      }

      if (symbol) {
        if (symbol.type === 'simple-fill') {
          return {
            fillColor: symbol.color ? 
              `rgba(${symbol.color.r}, ${symbol.color.g}, ${symbol.color.b}, ${symbol.color.a})` : 
              'rgba(0, 0, 0, 0.3)',
            outlineColor: symbol.outline?.color ? 
              `rgba(${symbol.outline.color.r}, ${symbol.outline.color.g}, ${symbol.outline.color.b}, ${symbol.outline.color.a})` : 
              '#000',
            outlineWidth: symbol.outline?.width || 1
          };
        }
      }
    } catch (error) {
      console.error('Error getting layer symbol:', error);
    }
    return null;
  };

  handleDelete = async () => {
    const { selectedGraphic } = this.state;

    
    
    if (!selectedGraphic || !selectedGraphic.layer) {
      console.error('No feature selected for deletion');
      return;
    }
  
    try {
      const result = await selectedGraphic.layer.applyEdits({
        deleteFeatures: [selectedGraphic]
      });
  
      if (result.deleteFeatureResults.length > 0 && result.deleteFeatureResults[0].success) {
        console.log('Feature deleted successfully');
        this.handleClose(); 
      } else {
        console.error('Failed to delete feature');
      }
    } catch (error) {
      console.error('Error deleting feature:', error);
    }
  };

 
  

  handleEscKey = (event) => {
    if (event.key === 'Escape') {
      const { sketchViewModel } = this.state;
      if (sketchViewModel) {
        sketchViewModel.cancel();
      }

      this.state.tempGraphicsLayer?.removeAll();
      this.cleanupFeatureForm();
      this.setState({ 
        previewGraphic: null,
        isDrawingActive: false, 
        activeDrawMode: null,
        isDrawingPolygon: false,   
        editorVisible: false,
        selectedGraphic: null,
      });
    }
  };



  handleSubmitChanges = async () => {
    try {
      if (this.state.sketchViewModel) {
        await this.state.sketchViewModel.complete();
      }
  
      const { selectedGraphic, previewGraphic, selectedLayer } = this.state;
      let formValues = {};
      let retryCount = 0;
      const maxRetries = 3;
  
      while (retryCount < maxRetries) {
        if (this.featureFormRef.current) {
          try {
            formValues = this.featureFormRef.current.getValues();
            break;
          } catch (error) {
            console.warn(`Attempt ${retryCount + 1} to get form values failed:`, error);
            await new Promise(resolve => setTimeout(resolve, 100));
            retryCount++;
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 100));
          retryCount++;
        }
      }
  
      if (previewGraphic && selectedLayer) {
        const addResult = await selectedLayer.applyEdits({
          addFeatures: [{
            geometry: previewGraphic.geometry,
            attributes: formValues
          }]
        });
  
        if (!addResult.addFeatureResults?.[0]?.success) {
          throw new Error("Failed to add new feature");
        }
  
        console.log("New feature added successfully");
      }
      else if (selectedGraphic) {
        const layer = selectedGraphic.layer;
        if (!layer) {
          throw new Error("No valid layer found for update");
        }
  
        const geometry = this.latestPendingGraphic ? 
          this.latestPendingGraphic.geometry : 
          selectedGraphic.geometry;
  
        const updatedGraphic = {
          geometry: geometry,
          attributes: {
            ...selectedGraphic.attributes,
            ...formValues
          }
        };
  
        const result = await layer.applyEdits({
          updateFeatures: [updatedGraphic]
        });
  
        if (!result.updateFeatureResults?.[0]?.success) {
          throw new Error("Failed to update feature");
        }
  
        console.log("Feature updated successfully");
      }
  
      this.latestPendingGraphic = null;
      this.setState({
        pendingGraphic: null,
        selectedGraphic: null,
        editorVisible: false,
        isSubmitted: true,
        previewGraphic: null,
        isDrawingActive: false,
        isDrawingPolygon: false
      });
  
      if (this.state.tempGraphicsLayer) {
        this.state.tempGraphicsLayer.removeAll();
      }
  
      return true;
  
    } catch (error) {
      console.error("Error in handleSubmitChanges:", error);
      throw error;
    }
  };



 
  render() {
    let mvc = <p>Please select a map.</p>;
  
    const { availableLayers, previewGraphic, editorVisible, isDrawingPolygon } = this.state;
  
    const css = `
      .layer-buttons {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;  
        padding: 1.5rem;
        max-width: 800px;
        margin: 0 auto;
      }
      
      .layer-option {
        background: white;
        padding: 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: flex-start;  
        gap: 2rem;  
        flex-wrap: wrap;
      }
        
      .layer-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex: 1;
        min-width: 200px;
      }
      
      .layer-symbol {
        width: 20px;
        height: 20px;
        border-radius: 4px;
      }
      
      .layer-title {
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
        margin: 0;
      }

      .button-group {
        display: flex;
        gap: 1rem; 
        flex-wrap: wrap;
        align-items: center;
      }
      
      .button-base {
        padding: 0.75rem 1.25rem;
        border-radius: 0.375rem;
        font-weight: 500;
        transition: all 0.2s;
        outline: none;
        border: none;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .button-base:focus {
        box-shadow: 0 0 0 2px #e5e7eb, 0 0 0 4px #18191a;
      }
      
      .button-base:active {
        transform: scale(0.98);
      }
      
      .button-primary {
        background-color: #3b82f6;
        color: white;
      }
      
      .button-primary:hover {
        background-color: #2563eb;
      }
      
      .button-primary:active {
        background-color: #1d4ed8;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      
      .button-success {
        background-color: #10b981;
        color: white;
      }
      
      .button-success:hover {
        background-color: #059669;
      }
      
      .button-success:active {
        background-color: #047857;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      
      .button-secondary {
        background-color: #f3f4f6;
        color: #374151;
        border: 1px solid #e5e7eb;
      }
      
      .button-secondary:hover {
        background-color: #e5e7eb;
      }
      
      .button-secondary:active {
        background-color: #d1d5db;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      
      .button-danger {
        background-color: #ef4444;
        color: white;
      }
      
      .button-danger:hover {
        background-color: #dc2626;
      }
      
      .button-danger:active {
        background-color: #b91c1c;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      
      .preview-controls {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        display: flex;
        gap: 0.5rem;
        padding: 1rem;
        background: white;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
      }
      
      .editor-container {
        position: fixed;
        top: 50%;
        left: 20%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 0.5rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        z-index: 2000;
        width: 500px;
        height: 600px;
        display: flex;
        flex-direction: column;
        padding: 1.5rem;
      }
      
      .feature-form-container {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 4rem;
      }
      
      .button-container {
        position: absolute;
        bottom: 1rem;
        right: 1rem;
        display: flex;
        gap: 0.5rem;
        padding: 1rem;
        background-color: white;
        z-index: 2001;
      }
    `;
  
    if (this.props.hasOwnProperty('useMapWidgetIds') && this.props.useMapWidgetIds?.[0]) {
      mvc = (
        <JimuMapViewComponent
          useMapWidgetId={this.props.useMapWidgetIds[0]}
          onActiveViewChange={this.activeViewChangeHandler}
        />
      );
    }
  
    return (
      <div className="widget-js-api-editor" style={{ height: '100%', overflow: 'auto' }}>
        <div className="layer-buttons">
          {availableLayers.map((layer) => {
            const symbol = this.getLayerSymbol(layer);
            const isPointLayer = layer.geometryType === 'point';
            const activeLayerId = this.state.selectedLayer?.id;
            const isActiveLayer = layer.id === activeLayerId;
            const isDrawingPolygon = this.state.isDrawingActive && !isPointLayer;
            const isDrawingPoint = this.state.isDrawingActive && isPointLayer;

            
            if (!this.state.isDrawingActive || isActiveLayer) {
              return (
                <div key={layer.id} className="layer-option">
                  <div className="layer-header">
                    {symbol && (
                      <div 
                        className="layer-symbol" 
                        style={{
                          backgroundColor: symbol.fillColor,
                          border: `${symbol.outlineWidth}px solid ${symbol.outlineColor}`,
                          width: '20px',  
                          height: '20px',
                          borderRadius: '4px',
                          display: 'inline-block' 
                        }}
                      />
                    )}
                    <h3 className="layer-title">{layer.title}</h3>
                  </div>
  
                  {isActiveLayer && isDrawingPolygon && (
                    <pre
                      style={{
                        marginTop: '8px',
                        color: '#555',
                        fontSize: '14px',
                        whiteSpace: 'pre-wrap',
                        textAlign: 'center'
                      }}
                    >
                      Click the map to start drawing. 
                      {"\n"}
                      {"\n"}
                      {"\n"}Double-click to finish drawing. 
                      {"\n"}
                      {"\n"}
                      {"\n"}Press ESC to discard edits.
                    </pre>
                  )}

                  {isActiveLayer && isDrawingPoint && (
                    <pre
                      style={{
                        marginTop: '8px',
                        color: '#555',
                        fontSize: '14px',
                        whiteSpace: 'pre-wrap',
                        textAlign: 'center'
                      }}
                    >
                      Click the map to place point. 
                      {"\n"}
                      {"\n"}
                      {"\n"}Press ESC to discard edits.
                    </pre>
                  )}

  
                {(!this.state.isDrawingActive || isActiveLayer) && (
                    <div className="button-group">
                      {isPointLayer ? (
                        <>
                          
                          {!isDrawingPoint && (
                            <>
                            <button 
                              className="button-base button-primary"
                              onClick={() => this.handleLayerSelectionAndDrawing(layer.id, 'point')}
                              disabled={this.state.isDrawingActive && !isActiveLayer}
                            >
                              Create Point
                            </button>

                            <button 
                            className="button-base button-secondary"
                            onClick={() => this.handleSelectFeature(layer.id)}
                            disabled={this.state.isDrawingActive && !isActiveLayer}
                            >
                            Select & Edit Feature
                            </button>
                            </>
                        )}
                        
                      </>
                      ) : (
                        <>
                          {!isDrawingPolygon && (
                            <>
                              <button 
                                className="button-base button-primary"
                                onClick={() => this.handleLayerSelectionAndDrawing(layer.id, 'polygon')}
                                disabled={this.state.isDrawingActive && !isActiveLayer}
                              >
                                Create Polygon
                              </button>
                              <button 
                                className="button-base button-primary"
                                onClick={() => this.handleLayerSelectionAndDrawing(layer.id, 'freehand')}
                                disabled={this.state.isDrawingActive && !isActiveLayer}
                              >
                                Create Freehand Polygon
                              </button>
                              <button 
                                className="button-base button-secondary"
                                onClick={() => this.handleSelectFeature(layer.id)}
                                disabled={this.state.isDrawingActive && !isActiveLayer}
                              >
                                Select & Edit Feature
                              </button>
                            </>
                            
                          )}
                          
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>
  
        {this.state.isDrawingActive && (
          <div
            style={{
              position: 'fixed',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(255, 0, 0, 0.9)',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>Press ESC key to cancel drawing</span>
          </div>
        )}
  
  
        {/* Feature editor */}
        {editorVisible && (
          <div className="editor-container">
            <div className="feature-form-container" />
            <div className="button-container">
              <button
                onClick={this.handleClose}
                className="button-base button-secondary"
              >
                Close
              </button>
              <button
               onClick={() => {
                  this.handleSubmitChanges()
                    .catch((error) => {
                      console.error("Failed to submit changes:", error);
                    })
                    .finally(() => {
                      this.handleClose();
                    });
                }} 
                className="button-base button-primary"
              >
                Update Changes
              </button>
              <button
                onClick={() => {
                  this.handleDelete();
                  this.handleClose();
                }}
                className="button-base button-danger"
              >
                Delete Feature
              </button>
            </div>
          </div>
        )}
  
        <div ref={this.myRef}>
          <style>{css}</style>
        </div>
        {mvc}
      </div>
    );
  }

  
//FUTURE IMPROVEMENTS:


//draw pause
