import { combineReducers } from 'redux';

const gameReducer = (state = {}, action) => {
    switch (action.type) {
        case 'SET_GAME':
            return { ...state, ...action.payload };
        case 'UPDATE_GAME':
            return { ...state, ...action.payload };
        default:
            return state;
    }
};

const rootReducer = combineReducers({
    game: gameReducer,
});

export default rootReducer;
