/**
 * NoteTaskBot — Lasso OCR / page-context to Todoist
 * @format
 */

import React, {useState, useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import Capture from './src/screens/Capture';
import AddContext from './src/screens/AddContext';
import {CONTEXT_BUTTON_ID} from './src/utils/lassoCache';

function App(): React.JSX.Element {
  const [captureGen, setCaptureGen] = useState(
    () => global.__noteTaskBotCaptureGen || 0,
  );
  const [buttonId, setButtonId] = useState(
    () => global.__noteTaskBotButtonId || 200,
  );

  useEffect(() => {
    global.__noteTaskBotNavigate = (_name: string) => {
      setButtonId(global.__noteTaskBotButtonId || 200);
      setCaptureGen(g => g + 1);
    };
    global.__noteTaskBotOnCaptureRequest = (gen?: number) => {
      setButtonId(global.__noteTaskBotButtonId || 200);
      setCaptureGen(g => (typeof gen === 'number' ? gen : g + 1));
    };
    return () => {
      global.__noteTaskBotNavigate = null;
      global.__noteTaskBotOnCaptureRequest = null;
    };
  }, []);

  const screen =
    buttonId === CONTEXT_BUTTON_ID ? (
      <AddContext key={`ctx-${captureGen}`} />
    ) : (
      <Capture key={`cap-${captureGen}`} />
    );

  return <View style={styles.container}>{screen}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default App;
