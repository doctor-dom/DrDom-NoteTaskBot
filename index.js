/**
 * NoteTaskBot — Lasso handwriting to Todoist subtasks
 *
 * Button 100 (toolbar, NOTE): Attach current page PNG to page-scoped parent
 * Button 200 (lasso, NOTE): Capture handwriting as a subtask under the note's parent
 * Config button: not used (token via MyStyle JSON)
 *
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';
import {cacheLassoOnButtonPress} from './src/utils/lassoCache';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;

PluginManager.registerButton(1, ['NOTE'], {
  id: 100,
  name: 'add context -> Todoist',
  icon,
  showType: 1,
});

PluginManager.registerButton(2, ['NOTE'], {
  id: 200,
  name: '-> Todoist',
  icon,
  editDataTypes: [0, 1, 3],
  showType: 1,
});

global.__noteTaskBotButtonId = null;

PluginManager.registerButtonListener({
  onButtonPress: (msg) => {
    global.__noteTaskBotButtonId = msg.id;
    cacheLassoOnButtonPress(msg.id);
  },
});
