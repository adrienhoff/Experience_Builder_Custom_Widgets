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
  activeDrawMode: null;
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

  componentDidMount() {
    // Add your existing componentDidMount code here if any
    document.addEventListener('keydown', this.handleEscKey);
  }

  componentWillUnmount() {
    // Add your existing componentWillUnmount code here if any
    document.removeEventListener('keydown', this.handleEscKey);
  }
  

  componentDidUpdate() {
    if (this.props.state === 'CLOSED') {
      console.log("Widget is closed - canceling draw mode");
      // Cancel any active SketchViewModel operations
      if (this.state.sketchViewModel) {
        this.state.sketchViewModel.cancel();
        this.state.sketchViewModel.destroy();
      }
  
      // Clear temporary graphics
      if (this.state.tempGraphicsLayer) {
        this.state.tempGraphicsLayer.removeAll();
      }
  
      // Reset all drawing states
      this.setState({ 
        previewGraphic: null,
        isDrawingActive: false,
        isDrawingPolygon: false,
        activeDrawMode: null,
        sketchViewModel: null
      });
  
      // Reset cursor if needed
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

    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.cancel();
    }
        
  
    this.cleanupFeatureForm();
    
    this.setState({
      editorVisible: false,
      selectedGraphic: null,
      previewGraphic: null,
      isDrawingActive: false,
      isDrawingPolygon: false,
      activeDrawMode: null
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
          elements: fields
            .filter(field => !["Shape__Area", "Shape__Length"].includes(field.name)) // Exclude unwanted fields
            .map(field => ({
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
      if (!this.state.selectedGraphic) {
        console.error("No feature selected for updating.");
        return;
      }
    
      const { selectedGraphic } = this.state;
    
      try {
        // Update attributes
        const updatedAttributes = featureForm.getValues();
        Object.keys(updatedAttributes).forEach((key) => {
          selectedGraphic.attributes[key] = updatedAttributes[key];
        });
    
        // Include updated geometry
        const updatedGraphic = new Graphic({
          geometry: selectedGraphic.geometry, // Ensure the current geometry is included
          attributes: selectedGraphic.attributes,
          layer: selectedGraphic.layer,
        });
    
        // Apply edits with both attributes and geometry
        const result = await selectedGraphic.layer.applyEdits({
          updateFeatures: [updatedGraphic],
        });
    
        if (result.updateFeatureResults.length > 0 && result.updateFeatureResults[0].success) {
          console.log("Feature updated successfully!");
    
          // Reinitialize the SketchViewModel with the updated feature
          const view = this.state.jimuMapView.view;
          this.initializeReshapeSketchVM(view, updatedGraphic);
    
          // Close the editor and reset state
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
      this.setState(
        { 
          selectedLayer: layer, 
          activeDrawMode: mode,
          isDrawingActive: true 
        },
        () => {
          // Ensure SketchViewModel is initialized before starting drawing
          this.initializeSketchViewModel(this.state.jimuMapView.view, mode);
          
          // Delay startDrawing to ensure initialization is complete
          setTimeout(() => {
            this.startDrawing(mode);
          }, 0); // A small delay ensures the state update and initialization complete
        }
      );
    }
  };
  

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
      updateOnGraphicClick: true,
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
      updateOnGraphicClick: true,
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
      this.state.jimuMapView.view.cursor = 'default';  // Or 'default', depending on the desired cursor style

      this.state.sketchViewModel.create('polygon', { mode });
    }
  };

  // Function to start reshaping a temporary graphic
startReshapeTempGraphic = () => {
  const { sketchViewModel, tempGraphicsLayer } = this.state;

  if (sketchViewModel && tempGraphicsLayer.graphics.length > 0) {
    const graphicToEdit = tempGraphicsLayer.graphics.getItemAt(0); // Edit the first graphic in tempGraphicsLayer
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

    // Clear any temporary graphics that were drawn
    if (this.state.tempGraphicsLayer) {
        this.state.tempGraphicsLayer.removeAll();
    }

    // Reset state to cancel the drawing mode
    this.setState({
        previewGraphic: null,  // Reset preview graphic
        isDrawingPolygon: false,  // Stop the drawing polygon flag
        isDrawingActive: false,,
        activeDrawMode: null
    });
  };


  getFeatureLayers = (layers, groupNameFilter: string) => {
    const featureLayers: FeatureLayer[] = [];
    
    layers.forEach((layer) => {
      if (layer.type === 'group') {
        // Check if the group's name matches the filter before processing
        if (layer.title === groupNameFilter) {
          // Recursively search layers in the matching group
          featureLayers.push(...this.getFeatureLayers(layer.layers, groupNameFilter));
        }
      } else if (layer.type === 'feature' && (layer.title === 'National FireGuard Service')) {
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

  initializeReshapeSketchVM = (view: __esri.MapView, selectedFeature: __esri.Graphic) => {
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
      /* snappingOptions: {
        enabled: true,
        distance: 15,
        featureSources: allFeatureLayers.map((layer) => ({
          layer,
          enabled: true,
        })),
      }, */
    });
    
    //this closes form when clicked off graphic. Would like to update this so that a click away does not drop the sketchVM
    const clickHandler = view.on("click", (event) => {
      const screenPoint = { x: event.x, y: event.y };
      
      view.hitTest(screenPoint).then((response) => {
        const result = response.results.find((r) => r.graphic === clonedFeature);
        
        /* if (!result) {
          // Click was outside the graphic being edited
          sketchVM.cancel();
          clickHandler.remove();
          
          // Close the editor and reset state
          this.handleClose();
        }
      });
    }); */

        if (!result) {
          // Ensure pending changes are saved before canceling
          if (this.latestPendingGraphic) {
           this.commitPendingChanges();
         }
          
          // Cleanup
          sketchVM.cancel();
          clickHandler.remove();
          graphicsLayer.remove(clonedFeature);
          view.map.remove(graphicsLayer);
          
          this.handleClose();
        }
      });
    });
  
    sketchVM.update([clonedFeature], {
      tool: "reshape",
      enableRotation: true,
      enableScaling: true,
      preserveAspectRatio: false,
    });

    
  
    sketchVM.on("update", (updateEvent) => {
      if (updateEvent.state === "complete") {
        console.log("Reshape update complete");
  
          this.latestPendingGraphic = new Graphic({
          geometry: updateEvent.graphics[0].geometry,
          attributes: selectedFeature.attributes,
          layer: selectedFeature.layer,
        });
  
        this.setState({ pendingGraphic: this.latestPendingGraphic });

        
  
        console.log("Pending graphic stored:", this.latestPendingGraphic);

        graphicsLayer.remove(clonedFeature); // Remove cloned feature
        //view.map.remove(graphicsLayer); // Remove the graphics layer
      }
    });
  
    this.setState({ sketchViewModel: sketchVM, });
    
  };

   private commitPendingChanges = () => {
    if (this.latestPendingGraphic) {
      // Apply the changes to the original feature's layer
      this.latestPendingGraphic.layer.applyEdits({
        updateFeatures: [this.latestPendingGraphic]
      }).then((result) => {
        console.log("Changes committed successfully:", result);
        this.latestPendingGraphic = null;
      }).catch((error) => {
        console.error("Error committing changes:", error);
      });
    }
  }; 


  
    
  

  handleSelectFeature = (layerId: string) => {
    const layer = this.state.jimuMapView?.view.map.findLayerById(layerId) as FeatureLayer;
    if (!layer || !this.state.jimuMapView) return;
  
    const view = this.state.jimuMapView.view;
  
    // Create a click handler for selection
    const clickHandler = view.on("click", async (event) => {
      const screenPoint = { x: event.x, y: event.y };
  
      try {
        const response = await view.hitTest(screenPoint);
        const result = response.results.find((result) => 
          result.graphic.layer === layer && 
          result.graphic.geometry
        );
  
        if (result) {
          // Remove click handler after selection
          clickHandler.remove();
  
          const selectedFeature = result.graphic;

          // Query the feature with all attributes
          const query = layer.createQuery();
          query.objectIds = [selectedFeature.attributes[layer.objectIdField]];
          query.outFields = ["*"];
          const queryResult = await layer.queryFeatures(query);

          if (queryResult.features.length > 0) {
            const fullyPopulatedGraphic = queryResult.features[0];
  
          // Update state and initialize both editor and reshape
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
  
              // Initialize reshape capability
              this.initializeReshapeSketchVM(view, selectedFeature);
            }
          );
        } else {
          console.log("No feature selected at clicked location.");
        }
      } catch (error) {
        console.error("Error selecting feature:", error);
        clickHandler.remove();
      }
    });
  };


   
  exitReshapeMode = () => {
    // Check if SketchViewModel exists
    if (this.state.sketchViewModel) {
      // Cancel any ongoing drawing or editing
      this.state.sketchViewModel.cancel();
  
      this.setState({ sketchViewModel: null });
  
      // Restore the cursor to default
      if (this.state.jimuMapView) {
        this.state.jimuMapView.view.cursor = "default"; // or whatever cursor you prefer
      }
    }
  
    // Optional: Reset any state related to editing mode
    this.setState({
      editorVisible: false,
      selectedGraphic: null,
      previewGraphic: null,
      isDrawingActive: false,
      isDrawingPolygon: false,
      activeDrawMode: null
    });
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
        this.handleClose(); // Close the editor after successful deletion
      } else {
        console.error('Failed to delete feature');
      }
    } catch (error) {
      console.error('Error deleting feature:', error);
    }
  };

 
  

  handleEscKey = (event) => {
    if (event.key === 'Escape') {
      // Reset the drawing state
      const { sketchViewModel } = this.state;
      if (sketchViewModel) {
        sketchViewModel.cancel();
      }

      // Clear graphics and reset all related state
      this.state.tempGraphicsLayer?.removeAll();
      this.setState({ 
        previewGraphic: null,
        isDrawingActive: false, // This deactivates the drawing mode
        activeDrawMode: null    // This resets the draw mode
      });
    }
  };
  
  cancelDrawing = () => {
    const { sketchViewModel } = this.state;
    if (!sketchViewModel) { 
      return;
    }
    
    // Reset the drawing state
    sketchViewModel.cancel();

    // Clear graphics and reset all related state
    this.state.tempGraphicsLayer?.removeAll();
    this.setState({ 
        previewGraphic: null,
        isDrawingActive: false, // This deactivates the drawing mode
        activeDrawMode: null    // This resets the draw mode
    });
  };


  handleSubmitChanges = async () => {
    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.complete(); // Finalize any active editing session
    }
  
    const pendingGraphic = this.latestPendingGraphic;
  
    if (!pendingGraphic) {
      console.error("No pending changes to submit.");
      return;
    }
  
    try {
      const layer = pendingGraphic.layer;
  
      if (!layer) {
        console.error("No valid layer to commit edits.");
        return;
      }

      // Retrieve the feature form values directly before creating the graphic
      const featureForm = this.featureFormRef.current;
      const formAttributes = featureForm ? featureForm.getValues() : {};

      // Merge existing attributes with form attributes
      const updatedAttributes = {
        ...this.state.selectedGraphic.attributes, // Use the most recent selected graphic's attributes
        ...formAttributes
      };

      // Create a new graphic with updated geometry and attributes
      const updatedGraphic = new Graphic({
        geometry: pendingGraphic.geometry,
        attributes: updatedAttributes,
        layer: pendingGraphic.layer
      });
  
      const result = await layer.applyEdits({
        updateFeatures: [updatedGraphic],
      });
  
      if (result.updateFeatureResults.length > 0 && result.updateFeatureResults[0].success) {
        console.log("Edits successfully committed:", result);
  
        this.latestPendingGraphic = null;
        this.setState({
          pendingGraphic: null,
          selectedFeature: new Graphic({
            geometry: updatedGraphic.geometry,
            attributes: updatedGraphic.attributes,
          }),
      
            editorVisible: true,
            isSubmitted: false,
            previewGraphic: null,
            isDrawingActive: false,
            isDrawingPolygon: false
        });
  
        if (this.state.tempGraphicsLayer) {
          this.state.tempGraphicsLayer.removeAll();
        }
      } else {
        console.error("Failed to commit edits.");
      }
    } catch (error) {
      console.error("Error committing edits:", error);
    }
  };
  
  private editorRef = React.createRef<HTMLDivElement>();

  
  
 /*  handleSketchClose = () => {
    // Reset the drawing state, just like handleEscKey
    const { sketchViewModel } = this.state;
    if (sketchViewModel) {
      sketchViewModel.cancel();
    }
  
    // Clear graphics and reset all related state
    this.state.tempGraphicsLayer?.removeAll();
    this.setState({ 
      previewGraphic: null,
      isDrawingActive: false,
      activeDrawMode: null
    });
  }; */


  
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

                {this.state.isDrawingActive && (
                  <div
                    style={{
                      marginTop: '8px',
                      color: '#555',
                      fontSize: '14px'
                    }}
                  >
                    Double-click to finish drawing
                  </div>
                )}

                
                
                {!this.state.isDrawingActive && this.state.activeDrawMode !== 'freehand' && (
                    <button 
                      className="button-base button-primary"
                      onClick={() => this.handleLayerSelectionAndDrawing(layer.id, 'polygon')}
                    >
                      Create Polygon
                    </button>
                  )}

                  {!this.state.isDrawingActive && this.state.activeDrawMode !== 'polygon' && (
                    <button 
                      className="button-base button-primary"
                      onClick={() => this.handleLayerSelectionAndDrawing(layer.id, 'freehand')}
                    >
                      Create Freehand Polygon
                    </button>
                  )}

                  {/* Show the Select Feature button only if no drawing is active */}
                  {!this.state.isDrawingActive && (
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
                  )}
                </div>
              );
            })}
          </div>

          {this.state.isDrawingActive && this.state.activeDrawMode === 'polygon' && (
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

          
            

        {previewGraphic && (
          <div className="preview-controls">
            <button 
              onClick={this.startReshapeTempGraphic}
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
          <div 
          ref={this.editorRef} 
          className="editor-container">
            <div className="feature-form-container" />
            <div className="button-container">

            

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
                  this.handleSubmitChanges();
                  this.handleClose(); // Close the form after submitting changes

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
}


{/* 
//select editable layers and snapping layers from settings

// ensure reshape function to selected layer is stable

//add ui like editor
//draw pause

<button onClick={this.startReshapeSelectedGraphic}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
              >
                Reshape
              </button> */}
              
//drop sketchvm and view model when container
//snap for specific layers
//add point