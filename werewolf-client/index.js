import { registerRootComponent } from 'expo';

import SplitScreenChat from "./src/SplitScreenChat";
import {Provider} from "react-redux";
import store from './src/redux/store';

const App = () => {
    return (
        <Provider store={store}>
            <SplitScreenChat />
        </Provider>
    );
};

registerRootComponent(App);
