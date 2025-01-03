import { type AllWidgetProps, jsx, React } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import Editor from '@arcgis/core/widgets/Editor';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import PopupTemplate from '@arcgis/core/PopupTemplate';

interface State {
  jimuMapView: JimuMapView;
  currentWidget: Editor;
  sketchViewModel: SketchViewModel;
  selectedLayer: FeatureLayer | null;
  availableLayers: FeatureLayer[];
  previewGraphic: Graphic | null;
  tempGraphicsLayer: GraphicsLayer;
}

export default class Widget extends React.PureComponent<AllWidgetProps<unknown>, State> {
  private readonly myRef = React.createRef<HTMLDivElement>();

  constructor(props) {
    super(props);
    this.state = {
      jimuMapView: null,
      currentWidget: null,
      sketchViewModel: null,
      selectedLayer: props.config?.selectedLayer || null, // Get from settings
      availableLayers: [],
      previewGraphic: null,
      tempGraphicsLayer: new GraphicsLayer(),
    };
  }
  

  // Handle layer selection
  handleLayerSelection = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const layerId = event.target.value;
    const layer = this.state.jimuMapView?.view.map.findLayerById(layerId) as FeatureLayer;
    if (layer) {
      this.setState({ selectedLayer: layer }, () => {
        // Reinitialize SketchViewModel with the updated selected layer
        this.initializeSketchViewModel(this.state.jimuMapView.view);
      });
    }
  };

  // Initialize SketchViewModel for freehand drawing
  initializeSketchViewModel = (view) => {
    view.map.add(this.state.tempGraphicsLayer);

    const sketchViewModel = new SketchViewModel({
      view,
      layer: this.state.tempGraphicsLayer,
      updateOnGraphicClick: false
      /*snappingOptions: {
        enabled: true,
        distance: 50,
        selfEnabled: true,
        featureSources: this.state.selectedLayer
        ? [
            {
              layer: this.state.selectedLayer,  // Snap to the selected layer
              enabled: true
            }
          ]
        : [] // Fallback to no snapping if no layer is selected
    }*/
  });

  
    
    sketchViewModel.on('create', (event) => {
      if (event.state === 'complete') {
        const graphic = event.graphic;
        this.setState({ previewGraphic: graphic });
        console.log('Polygon drawn, awaiting confirmation.');
      }
    });

    this.setState({ sketchViewModel });
  };

  // Handle freehand polygon creation
  handleFreehandPolygon = () => {
    if (this.state.sketchViewModel) {
      this.state.tempGraphicsLayer.removeAll();
      this.state.sketchViewModel.create('polygon', { mode: 'freehand' });
    }
 
  };



  // Confirm adding polygon to the selected layer
  handleConfirmPolygon = async () => {
    const { previewGraphic, selectedLayer } = this.state;

    if (!selectedLayer || !previewGraphic) {
      console.error('No layer selected or no polygon to confirm!');
      return;
    }

    try {
      await selectedLayer.applyEdits({
        addFeatures: [new Graphic({
          geometry: previewGraphic.geometry,
          attributes: {},
          popupTemplate: new PopupTemplate({
            title: 'Freehand Polygon',
            content: 'This is a freehand drawn polygon.'
          })
        })]
      });

      console.log('Polygon added to the selected layer!');
      this.state.tempGraphicsLayer.removeAll();
      this.setState({ previewGraphic: null });
    } catch (error) {
      console.error('Failed to add polygon to the selected layer:', error);
    }
  };

  // Cancel the drawn polygon
  handleCancelPolygon = () => {
    this.state.tempGraphicsLayer.removeAll();
    this.setState({ previewGraphic: null });
    console.log('Polygon creation canceled.');
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
      } else if (layer.type === 'feature' && (layer.title === 'National FireGuard Service' || layer.title === 'FireGuard Reference Points')) {
        // Only add feature layers that are editable and match the desired titles
        featureLayers.push(layer as FeatureLayer);
      }
    });
  
    return featureLayers;
  };
  

  // Handle active map view change
  activeViewChangeHandler = (jmv: JimuMapView) => {
    if (this.state.jimuMapView) {
      if (this.state.currentWidget) {
        this.state.currentWidget.destroy();
      }
    }

    if (jmv) {
      // Define which group name to filter by (adjust as necessary)
      const groupNameFilter = 'Analyst Layers'; // Replace with the name of the group you want to filter
      const featureLayers = this.getFeatureLayers(jmv.view.map.layers, groupNameFilter);

      // Update the state with the new map view and feature layers
      this.setState({
        jimuMapView: jmv,
        availableLayers: featureLayers
      });

      // Initialize the Editor widget if the ref is available
      if (this.myRef.current) {
        const newEditor = new Editor({
          view: jmv.view,
          container: this.myRef.current,
          snappingOptions: {
            enabled: true,
            distance: 35,
            selfEnabled: true,
          }
        });

        this.setState({ currentWidget: newEditor });
        this.initializeSketchViewModel(jmv.view);
      } else {
        console.error('Could not find this.myRef.current');
      }
    }
  };

  

  
  render() {
    let mvc = <p>Please select a map.</p>;

    const { availableLayers, selectedLayer, previewGraphic } = this.state;

    const css = `
    .esri-editor__scroller {
        overflow-y: auto;
        padding-top: $cap-spacing--half;
        padding-bottom: $cap-spacing;
      }
      .esri-editor__content-group {
        max-height: 1em;
      }
      `;

    if (
      this.props.hasOwnProperty('useMapWidgetIds') &&
      this.props.useMapWidgetIds &&
      this.props.useMapWidgetIds[0]
    ) {
      mvc = (
        <JimuMapViewComponent
          useMapWidgetId={this.props.useMapWidgetIds?.[0]}
          onActiveViewChange={this.activeViewChangeHandler}
        />
      );
    }

    return (
      <div
        className="widget-js-api-editor"
        style={{ height: '100%', overflow: 'auto' }}
      >
        <div>
          <label htmlFor="layer-select">Select Layer:</label>
          <select
            id="layer-select"
            onChange={this.handleLayerSelection}
            value={selectedLayer?.id || ''}
          >
            <option value="" disabled>
              -- Select a Layer --
            </option>
            {availableLayers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.title}
              </option>
            ))}
          </select>

          <button onClick={this.handleFreehandPolygon}>Draw Freehand Polygon</button>
        </div>

        {previewGraphic && (
          <div>
            <button onClick={this.handleConfirmPolygon}>Confirm</button>
            <button onClick={this.handleCancelPolygon}>Cancel</button>
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
