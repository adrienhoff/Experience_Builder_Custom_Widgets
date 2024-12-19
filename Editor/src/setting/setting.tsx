/**
  Licensing

  Copyright 2020 Esri

  Licensed under the Apache License, Version 2.0 (the "License"); You
  may not use this file except in compliance with the License. You may
  obtain a copy of the License at
  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
  implied. See the License for the specific language governing
  permissions and limitations under the License.

  A copy of the license is available in the repository's
  LICENSE file.
*/
import {React, defaultMessages as jimuCoreMessages, Immutable, DataSourceManager} from 'jimu-core';
import {type AllWidgetSettingProps} from 'jimu-for-builder';
import {type IMConfig, DrawMode} from '../config';
import defaultMessages from './translations/default';
import {MapWidgetSelector, SettingSection, SettingRow} from 'jimu-ui/advanced/setting-components';
import {Select, defaultMessages as jimuUIDefaultMessages} from 'jimu-ui';

export default class Setting extends React.PureComponent<AllWidgetSettingProps<IMConfig>, any> {
  state = {
    layerOptions: []
  };

  componentDidUpdate(prevProps) {
    if (prevProps.useMapWidgetIds !== this.props.useMapWidgetIds && this.props.useMapWidgetIds?.length > 0) {
      this.loadLayers();
    }
  }

  loadLayers = () => {
    const mapWidgetId = this.props.useMapWidgetIds?.[0];
    if (!mapWidgetId) return;

    const dsManager = DataSourceManager.getInstance();
    const mapDataSource = dsManager.getDataSource(mapWidgetId);

    if (mapDataSource) {
      const layers = mapDataSource.getSubDataSources();
      const layerOptions = Object.keys(layers).map(layerId => ({
        value: layerId,
        label: layers[layerId].getLabel()
      }));

      this.setState({ layerOptions });
    }
  };

  onLayerChange = (evt) => {
    const selectedLayer = evt.target.value;
    this.onPropertyChange('selectedLayer', selectedLayer);
  };

  onPropertyChange = (name, value) => {
    const { config } = this.props;
    if (value === config[name]) {
      return;
    }
    const newConfig = config.set(name, value);
    const alterProps = {
      id: this.props.id,
      config: newConfig
    };
    this.props.onSettingChange(alterProps);
  };

  onMapWidgetSelected = (useMapWidgetsId: string[]) => {
    this.props.onSettingChange({
      id: this.props.id,
      useMapWidgetIds: useMapWidgetsId
    });
  };

  handleDrawModeChange = (evt) => {
    const value = evt?.target?.value;
    this.onPropertyChange('creationMode', value);
  };

  formatMessage = (id: string, values?: { [key: string]: any }) => {
    const messages = Object.assign({}, defaultMessages, jimuUIDefaultMessages, jimuCoreMessages);
    return this.props.intl.formatMessage({ id: id, defaultMessage: messages[id] }, values);
  };

  render() {
    const { useMapWidgetIds, config } = this.props;
    const { layerOptions } = this.state;

    return (
      <div>
        <div className="widget-setting-psearch">
          <SettingSection className="map-selector-section" title={this.props.intl.formatMessage({id: 'sourceLabel', defaultMessage: defaultMessages.sourceLabel})}>
            <SettingRow label={this.formatMessage('selectMapWidget')}></SettingRow>
            <SettingRow>
              <MapWidgetSelector onSelect={this.onMapWidgetSelected} useMapWidgetIds={useMapWidgetIds} />
            
          </SettingSection>

          <SettingSection title={this.props.intl.formatMessage({id: 'layerSelectorLabel', defaultMessage: 'Layer Selector'})}>
            
          </SettingSection>
        </div>
      </div>
    );
  }
}
