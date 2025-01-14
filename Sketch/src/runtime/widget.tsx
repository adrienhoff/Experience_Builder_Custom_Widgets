import { type AllWidgetProps, jsx, React } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import FeatureForm from "@arcgis/core/widgets/FeatureForm";

interface State {
  jimuMapView: JimuMapView;
  sketchViewModel: SketchViewModel;
  selectedLayer: FeatureLayer | null;
  availableLayers: FeatureLayer[];
  previewGraphic: Graphic | null;
  tempGraphicsLayer: GraphicsLayer;
  isDrawingPolygon: boolean;
  editorVisible: boolean;
  selectedGraphic: Graphic | null;
}


export default class Widget extends React.PureComponent<AllWidgetProps<unknown>, State> {
  private readonly myRef = React.createRef<HTMLDivElement>();
  featureFormRef: any;

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
    };
  }

  

  cleanupFeatureForm = () => {
    if (this.featureFormRef.current) {
      this.featureFormRef.current.destroy();
      this.featureFormRef.current = null;
    }
  };

  handleClose = () => {
    this.cleanupFeatureForm();
    this.setState({
      editorVisible: false,
      selectedGraphic: null,
      previewGraphic: null,
      isDrawingPolygon: false
    });
  };

  handleConfirmPolygon = async () => {
    const { previewGraphic, selectedLayer } = this.state;
  
    if (!selectedLayer || !previewGraphic) {
      console.error('No layer selected or no polygon to confirm!');
      return;
    }
  
    try {
      const addResult = await selectedLayer.applyEdits({
        addFeatures: [new Graphic({
          geometry: previewGraphic.geometry,
          attributes: {}, 
        })],
      });
  
      if (addResult.addFeatureResults.length > 0) {
        const objectId = addResult.addFeatureResults[0].objectId;
  
        if (objectId) {
          const query = selectedLayer.createQuery();
          query.objectIds = [objectId];
          query.outFields = ['*'];
          query.returnGeometry = true;
  
          const queryResult = await selectedLayer.queryFeatures(query);
  
          if (queryResult.features.length > 0) {
            const addedGraphic = queryResult.features[0];
            console.log('Feature added:', addedGraphic);
  
            await new Promise<void>(resolve => {
              this.setState({
                selectedGraphic: addedGraphic,
                editorVisible: true,
                isSubmitted: false,
                previewGraphic: null,
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
            });
          }
        }
      }
  
      this.state.tempGraphicsLayer.removeAll();
    } catch (error) {
      console.error('Failed to add polygon to the selected layer:', error);
    }
  };

  launchFeatureFormWidget = async (container) => {
    const { jimuMapView, selectedGraphic } = this.state;
  
    if (!container || !jimuMapView || !selectedGraphic) {
      console.error("Missing container, map view, or selected graphic.");
      return;
    }
  
    this.cleanupFeatureForm();
    container.innerHTML = '';
  
    const featureLayer = selectedGraphic.layer;
  
    if (!(featureLayer instanceof FeatureLayer)) {
      console.error("Selected graphic's layer is not a FeatureLayer.");
      return;
    }
  
    const fields = featureLayer.fields;
  
    const formTemplate = {
      elements: [
        {
          type: "group",
          label: "Attributes",
          elements: fields.map(field => ({
            type: "field",
            fieldName: field.name,
            label: field.alias || field.name,
            editable: field.editable,
          })),
        },
      ],
    };
  
    const featureForm = new FeatureForm({
      container: container,
      layer: featureLayer,
      feature: selectedGraphic,
      formTemplate: formTemplate,
    });
  
    this.featureFormRef.current = featureForm;
  
    featureForm.on("submit", async () => {
      if (!selectedGraphic) {
        console.error("No feature selected for updating.");
        return;
      }
  
      try {
        const updatedAttributes = featureForm.getValues();
        Object.keys(updatedAttributes).forEach((key) => {
          selectedGraphic.attributes[key] = updatedAttributes[key];
        });
  
        const result = await featureLayer.applyEdits({
          updateFeatures: [selectedGraphic],
        });
  
        if (result.updateFeatureResults.length > 0) {
          console.log("Feature updated successfully!");
          this.handleClose();
        } else {
          console.error("Failed to update the feature.");
        }
      } catch (error) {
        console.error("Error applying edits:", error);
      }
    });
  };

  handleLayerSelectionAndDrawing = (layerId: string, mode: 'polygon' | 'freehand') => {
    const layer = this.state.jimuMapView?.view.map.findLayerById(layerId) as FeatureLayer;
    if (layer) {
      this.setState({ selectedLayer: layer }, () => {
        this.initializeSketchViewModel(this.state.jimuMapView.view, mode);
        this.startDrawing(mode);
      });
    }
  };

/*   handleLayerSelectionAndDrawing = (layerId: string, mode: 'polygon' | 'freehand') => {
    const layer = this.state.jimuMapView?.view.map.findLayerById(layerId) as FeatureLayer;
    if (layer) {
      this.setState({ selectedLayer: layer }, () => {
        if (!this.state.sketchViewModel) {
        this.initializeSketchViewModel(this.state.jimuMapView.view, mode);
      } else if (this.state.sketchViewModel.createMode !== mode) {
        // If mode changes, clean up and reinitialize
        this.state.sketchViewModel.destroy();
        this.initializeSketchViewModel(this.state.jimuMapView.view, mode);
      } else {
        this.startDrawing(mode);
      }
    });
  }
};
 */
  initializeSketchViewModel = (view, mode: 'polygon' | 'freehand') => {
    view.map.add(this.state.tempGraphicsLayer);
  
    const getAllFeatureLayers = (layerCollection) => {
      const featureLayers: FeatureLayer[] = [];
      layerCollection.forEach((layer) => {
        if (layer.type === 'group') {
          featureLayers.push(...getAllFeatureLayers(layer.layers));
        } else if (layer.type === 'feature') {
          featureLayers.push(layer as FeatureLayer);
        }
      });
      return featureLayers;
    };

    // Only get feature layers if we're in polygon mode
    const allFeatureLayers = mode === 'polygon' ? getAllFeatureLayers(view.map.layers) : [];

    // Separate configurations for each mode
    const polygonConfig = {
      view,
      layer: this.state.tempGraphicsLayer,
      updateOnGraphicClick: false,
      defaultCreateOptions: {
        mode: 'click',
        hasZ: false
      },
      snappingOptions: {
        enabled: true,
        distance: 15,
        featureSources: allFeatureLayers.map((layer) => ({
          layer,
          enabled: true,
        }))
      }
    };

    const freehandConfig = {
      view,
      layer: this.state.tempGraphicsLayer,
      updateOnGraphicClick: false,
      defaultCreateOptions: {
        mode: 'freehand',
        hasZ: false
      },
      // Completely remove snapping for freehand mode
      snappingOptions: null
    };
  
    // Create SketchViewModel with the appropriate config
    const sketchViewModel = new SketchViewModel(
      mode === 'polygon' ? polygonConfig : freehandConfig
    );
  
    sketchViewModel.on('create', (event) => {
      if (event.state === 'complete') {
        const graphic = event.graphic;
        this.setState({ previewGraphic: graphic });
      } else if (event.state === 'cancel') {
        this.setState({
          previewGraphic: null,
          isDrawingPolygon: false
        });
        this.state.tempGraphicsLayer.removeAll();
      } else if (event.state === 'active') {
        this.setState({ isDrawingPolygon: true });
      }
    });

    sketchViewModel.on('update', (event) => {
      if (event.state === 'complete' && event.graphics.length > 0) {
        const selectedFeature = event.graphics[0];
        this.setState({ selectedFeature });
        console.log('Feature selected:', selectedFeature);
      }
    });
  
    this.setState({ sketchViewModel });
};



  startDrawing = (mode: 'polygon' | 'freehand') => {
    if (this.state.sketchViewModel) {
      this.setState({ isDrawingPolygon: true });
      this.state.tempGraphicsLayer.removeAll();
      this.state.sketchViewModel.create('polygon', { mode });
    }
  };

  startReshape = () => {
    const { sketchViewModel, tempGraphicsLayer } = this.state;
  
    if (sketchViewModel) {
      // Ensure there are graphics to select and update
      if (tempGraphicsLayer.graphics.length > 0) {
        const graphicToEdit = tempGraphicsLayer.graphics.getItemAt(0); // Edit the first graphic (or select dynamically)
        
        sketchViewModel.update([graphicToEdit], {
          tool: "transform", // Allow vertex reshaping
          enableRotation: true, // Optional: Enable rotation of the graphic
          enableScaling: true, // Optional: Enable scaling of the graphic
          preserveAspectRatio: false // Optional: Allow free-form scaling
        });
  
        console.log('Editing vertices of the selected graphic.');
      } else {
        console.warn('No graphics available to edit.');
      }
    } else {
      console.error('SketchViewModel is not initialized.');
    }
  };

  

  handleCancelPolygon = () => {
    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.cancel();
  }

    // Clear any temporary graphics that were drawn
    if (this.state.tempGraphicsLayer) {
        this.state.tempGraphicsLayer.removeAll();
    }

    // Reset state to cancel the drawing mode
    this.setState({
        previewGraphic: null,  // Reset preview graphic
        isDrawingPolygon: false,  // Stop the drawing polygon flag
    });
  };

 /*  getFeatureLayers = (layers, groupNameFilter: string) => {
    const featureLayers: FeatureLayer[] = [];
    layers.forEach((layer) => {
      if (layer.type === 'group') {
        if (layer.title === groupNameFilter) {
          featureLayers.push(...this.getFeatureLayers(layer.layers, groupNameFilter));
        }
      } else if (layer.type === 'feature') {
        featureLayers.push(layer as FeatureLayer);
      }
    });
    return featureLayers;
  }; */

  getFeatureLayers = (layers, groupNameFilter: string) => {
    const featureLayers: FeatureLayer[] = [];
    
    layers.forEach((layer) => {
      if (layer.type === 'group') {
        // Check if the group's name matches the filter before processing
        if (layer.title === groupNameFilter) {
          // Recursively search layers in the matching group
          featureLayers.push(...this.getFeatureLayers(layer.layers, groupNameFilter));
        }
      } else if (layer.type === 'feature' && (layer.title === 'National FireGuard Service' || layer.title === 'FireGuard Reference Points')) {
        // Only add feature layers that are editable and match the desired titles
        featureLayers.push(layer as FeatureLayer);
      }
    });
  
    return featureLayers;
  };
  

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

  handleSelectFeature = (layerId: string) => {
    const layer = this.state.jimuMapView?.view.map.findLayerById(layerId) as FeatureLayer;
    if (layer && this.state.jimuMapView) {
      const view = this.state.jimuMapView.view;
      
      // Create a click handler for selection
      const clickHandler = view.on('click', async (event) => {
        // Get the screen point from the click event
        const screenPoint = {
          x: event.x,
          y: event.y
        };

        try {
          // Perform a hitTest to see if we clicked on a feature
          const response = await view.hitTest(screenPoint);
          
          // Filter for features from our target layer
          const result = response.results.find(
            result => result.graphic.layer === layer
          );

          if (result) {
            const selectedFeature = result.graphic;
            console.log('Selected feature:', selectedFeature);

            // Initialize the SketchViewModel for editing if not already initialized
            if (!this.state.sketchViewModel) {
              this.initializeSketchViewModel(view, 'polygon');
            }

            // Update the selected graphic and show the editor
            this.setState({
              selectedGraphic: selectedFeature,
              editorVisible: true
            }, () => {
              // Initialize the form
              const container = document.querySelector('.feature-form-container');
              if (container) {
                this.launchFeatureFormWidget(container);
              }

              // Start the reshape operation
              if (this.state.sketchViewModel) {
                this.state.sketchViewModel.update([selectedFeature], {
                  tool: 'reshape'
                });
              }
            });

            // Remove the click event listener after selection
            clickHandler.remove();
          }
        } catch (error) {
          console.error('Error selecting feature:', error);
        }
      });
    }
  };

  getLayerSymbol = (layer: FeatureLayer) => {
    if (!layer) return null;

    try {
      const renderer = layer.renderer as any;
      let symbol;

      // Handle different renderer types
      if (renderer.type === 'simple') {
        symbol = renderer.symbol;
      } else if (renderer.type === 'unique-value') {
        symbol = renderer.defaultSymbol || (renderer.uniqueValueInfos[0] && renderer.uniqueValueInfos[0].symbol);
      }

      if (symbol) {
        // For polygon layers
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
        // Add handling for other symbol types if needed
      }
    } catch (error) {
      console.error('Error getting layer symbol:', error);
    }
    return null;
  };


  
  render() {
    let mvc = <p>Please select a map.</p>;

    const { availableLayers, previewGraphic, editorVisible, isDrawingPolygon } = this.state;

    const css = `
      .layer-buttons {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        max-width: 800px;
        margin: 0 auto;
      }
      
      .layer-option {
        background: white;
        padding: 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        gap: 1.5rem;
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
        box-shadow: 0 0 0 2px #e5e7eb, 0 0 0 4px #3b82f6;
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
      
      .select-feature-button {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 1000;
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
        left: 50%;
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
            
            return (
              <div key={layer.id} className="layer-option">
                <div className="layer-header">
                  {symbol && (
                    <div 
                      className="layer-symbol" 
                      style={{
                        backgroundColor: symbol.fillColor,
                        border: `${symbol.outlineWidth}px solid ${symbol.outlineColor}`
                      }}
                    />
                  )}
                  <h3 className="layer-title">{layer.title}</h3>
                </div>
                
                <button 
                className="button-base button-primary"
                onClick={() => this.handleLayerSelectionAndDrawing(layer.id, 'polygon')}
              >
                Draw Polygon (Snapping)
              </button>
              
              <button 
                className="button-base button-primary"
                onClick={() => this.handleLayerSelectionAndDrawing(layer.id, 'freehand')}
              >
                Draw Freehand Polygon
              </button>
            
              <button 
                onClick={() => this.handleSelectFeature(layer.id)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  marginLeft: '10px'
                }}
              >
                Select Feature
              </button>
            </div>
          ))}
        </div>

        {/* {isDrawingPolygon && (
          <div>
            <button onClick={this.handleCancelPolygon}>Cancel Polygon</button>
          </div>
        )} */}


        {/* {isDrawingPolygon && (
          <div>
            <button onClick={this.handleCancelPolygon}>Cancel Polygon</button>
          </div>
        )} */}
            

            {previewGraphic && (
          <div className="preview-controls">
            <button 
              onClick={this.startReshape}
              className="button-base button-secondary"
            >
              Reshape
            </button>
            <button 
              onClick={this.handleConfirmPolygon}
              className="button-base button-success"
            >
              Confirm
            </button>
            <button 
              onClick={this.handleCancelPolygon}
              className="button-base button-danger"
            >
              Cancel Polygon
            </button>
          </div>
        )}

        {editorVisible && (
          <div className="editor-container">
            <div className="feature-form-container" />
            <div className="button-container">

                                   

            <button onClick={this.startReshape}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
              >
                Reshape
              </button>


              <button
                onClick={this.handleClose}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '4px'
                }}
              >
                Close
              </button>

              <button
                onClick={() => {
                  const featureForm = this.featureFormRef.current;
                  if (featureForm) {
                    featureForm.submit();
                  }
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0066cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                Submit Changes
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
}



//cancel sketch tool on cancel before completed
//select editable layers and snapping layers from settings
//must double click when switching from freehand or poly to other
// add reshape function to selected layer 