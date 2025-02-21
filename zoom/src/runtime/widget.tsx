import { React, jsx } from 'jimu-core'
import { JimuMapViewComponent, JimuMapView } from 'jimu-arcgis'
import { AllWidgetProps, BaseWidget } from 'jimu-core'
import { TextInput, Button, Label } from 'jimu-ui'

interface State {
  jimuMapView: JimuMapView;
  currentScale: number;
  inputValue: string;
}

export default class ScaleWidget extends BaseWidget<AllWidgetProps<any>, State> {
  private mapView: __esri.MapView

  state = {
    jimuMapView: null,
    currentScale: 0,
    inputValue: ''
  }

  onActiveViewChange = (jimuMapView: JimuMapView) => {
    if (jimuMapView) {
      this.mapView = jimuMapView.view as __esri.MapView
      this.setState({ currentScale: this.mapView.scale })

      this.mapView.watch('scale', (scale) => {
        this.setState({ currentScale: scale })
      })
    }
  }

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ inputValue: e.target.value })
  }

  handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const scale = parseFloat(this.state.inputValue)
    
    if (this.mapView && !isNaN(scale) && scale > 0) {
      this.mapView.scale = scale
      this.setState({ inputValue: '' })  // Clear input after submission
    }
  }

  render() {
    if (!this.props.useMapWidgetIds || this.props.useMapWidgetIds.length === 0) {
      return <div>Please configure the widget by selecting a map source.</div>;
    }
  
    return (
      <div className="widget-scale p-3">
        <JimuMapViewComponent 
          useMapWidgetId={this.props.useMapWidgetIds[0]} 
          onActiveViewChange={this.onActiveViewChange}
        />
        
        <div className="current-scale mb-3">
          <Label>Current Scale: 1:{Math.round(this.state.currentScale)}</Label>
        </div>
        

        {(<pre
            style={{
              marginTop: '8px',
              color: '#555',
              fontSize: '10px',
              whiteSpace: 'pre-wrap',
              textAlign: 'center'
            }}
          >
            Can be used to match Google Earth Extent
            {"\n"}Use Google-Earth Extent in meters (located in the bottom right on map) for value.
            
          </pre>
        )}
        
        <form onSubmit={this.handleSubmit}>
          <div className="d-flex gap-2">
            <TextInput
              className="flex-grow-1"
              placeholder="Enter scale in meters"
              value={this.state.inputValue}
              onChange={this.handleInputChange}
              type="number"
              step="any"
              min="1"
            />
            <Button type="submit">
              Set Scale
            </Button>

           
          </div>
        </form>
      </div>
    );
  }
}
