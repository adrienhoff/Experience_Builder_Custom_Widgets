import { type AllWidgetProps, jsx, React } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import Editor from '@arcgis/core/widgets/Editor';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';

interface State {
  jimuMapView: JimuMapView;
  currentWidget: Editor;
  sketchViewModel: SketchViewModel;
  selectedLayer: FeatureLayer | null;
  availableLayers: FeatureLayer[];
}

export default class Widget extends React.PureComponent<AllWidgetProps<unknown>, State> {
  private readonly myRef = React.createRef<HTMLDivElement>();

  constructor(props) {
    super(props);
    this.state = {
      jimuMapView: null,
      currentWidget: null,
      sketchViewModel: null,
      selectedLayer: null,
      availableLayers: []
    }
  }

  // Handle layer selection
  handleLayerSelection = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const layerId = event.target.value;
    const layer = this.state.jimuMapView?.view.map.findLayerById(layerId) as FeatureLayer;
    if (layer) {
      this.setState({ selectedLayer: layer });
    }
  }

  // Initialize SketchViewModel for freehand drawing
  initializeSketchViewModel = (view) => {
    const sketchViewModel = new SketchViewModel({
      view,
      layer: new GraphicsLayer(),
      updateOnGraphicClick: false
    });

    sketchViewModel.on('create', async (event) => {
      if (event.state === 'complete') {
        const { selectedLayer } = this.state;

        if (!selectedLayer) {
          console.error('No layer selected!');
          return;
        }

        // Add the geometry to the selected layer
        try {
          await selectedLayer.applyEdits({
            addFeatures: [
              {
                geometry: event.graphic.geometry,
                attributes: {} // Add default attributes if necessary
                ,
                aggregateGeometries: undefined,
                isAggregate: false,
                layer: new Layer,
                origin: undefined,
                popupTemplate: new PopupTemplate,
                symbol: new Symbol,
                visible: false,
                getAttribute: function (name: string) {
                  throw new Error('Function not implemented.');
                },
                getEffectivePopupTemplate: function (defaultPopupTemplateEnabled?: boolean): __esri.PopupTemplate {
                  throw new Error('Function not implemented.');
                },
                getObjectId: function (): number {
                  throw new Error('Function not implemented.');
                },
                setAttribute: function (name: string, newValue: any): void {
                  throw new Error('Function not implemented.');
                },
                destroyed: false,
                initialized: false,
                declaredClass: '',
                destroy: function (): void {
                  throw new Error('Function not implemented.');
                },
                get: function <T>(propertyName: string): T {
                  throw new Error('Function not implemented.');
                },
                set: function <T>(propertyName: string, value: T): __esri.Graphic {
                  throw new Error('Function not implemented.');
                },
                watch: function (path: string | string[], callback: __esri.WatchCallback, sync?: boolean): __esri.WatchHandle {
                  throw new Error('Function not implemented.');
                },
                addHandles: function <T>(handles: IHandle | IHandle[], groupKey?: GroupKey<T>): void {
                  throw new Error('Function not implemented.');
                },
                removeHandles: function <T>(groupKey?: GroupKey<T>): void {
                  throw new Error('Function not implemented.');
                },
                hasHandles: function <T>(groupKey?: GroupKey<T>): boolean {
                  throw new Error('Function not implemented.');
                },
                notifyChange: function (propertyName: string): void {
                  throw new Error('Function not implemented.');
                },
                _get: function (propertyName: string) {
                  throw new Error('Function not implemented.');
                },
                _set: function <T>(propertyName: string, value: T): __esri.Graphic {
                  throw new Error('Function not implemented.');
                },
                toJSON: function () {
                  throw new Error('Function not implemented.');
                },
                clone: function (): __esri.Graphic {
                  throw new Error('Function not implemented.');
                }
              }
            ]
          });
          console.log('Polygon added to the selected layer!');
        } catch (error) {
          console.error('Failed to add polygon to the selected layer:', error);
        }
      }
    });

    this.setState({ sketchViewModel });
  };

  // Handle freehand polygon creation
  handleFreehandPolygon = () => {
    if (this.state.sketchViewModel) {
      this.state.sketchViewModel.create('polygon', { mode: 'freehand' });
    }
  };

  // Handle active map view change
  activeViewChangeHandler = (jmv: JimuMapView) => {
    if (this.state.jimuMapView) {
      if (this.state.currentWidget) {
        this.state.currentWidget.destroy();
      }
    }

    if (jmv) {
      this.setState({
        jimuMapView: jmv,
        availableLayers: jmv.view.map.layers.filter(
          (layer) => layer.type === 'feature'
        ) as unknown as FeatureLayer[]
      });

      if (this.myRef.current) {
        const newEditor = new Editor({
          view: jmv.view,
          container: this.myRef.current
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

    const { availableLayers, selectedLayer } = this.state;

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

        <div ref={this.myRef}>
          <style>{css}</style>
        </div>
        {mvc}
      </div>
    );
  }
}
