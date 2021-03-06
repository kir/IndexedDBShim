import 'babel-polyfill'; // `Object.assign` including within `EventTarget`, generator functions, `Array.from`, etc.; see https://babeljs.io/docs/usage/polyfill/
import shimIDBVersionChangeEvent from './IDBVersionChangeEvent';
import {IDBCursor as shimIDBCursor, IDBCursorWithValue as shimIDBCursorWithValue} from './IDBCursor';
import {IDBRequest as shimIDBRequest, IDBOpenDBRequest as shimIDBOpenDBRequest} from './IDBRequest';
import {ShimDOMException} from './DOMException';
import {shimIndexedDB} from './IDBFactory';
import shimIDBKeyRange from './IDBKeyRange';
import shimIDBObjectStore from './IDBObjectStore';
import shimIDBIndex from './IDBIndex';
import shimIDBTransaction from './IDBTransaction';
import shimIDBDatabase from './IDBDatabase';
import polyfill from './polyfill';
import CFG from './CFG';

const glob = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : self);
glob._babelPolyfill = false; // http://stackoverflow.com/questions/31282702/conflicting-use-of-babel-register

function setConfig (prop, val) {
    if (prop && typeof prop === 'object') {
        for (const p in prop) {
            setConfig(p, prop[p]);
        }
        return;
    }
    if (!(prop in CFG)) {
        throw new Error(prop + ' is not a valid configuration property');
    }
    CFG[prop] = val;
}

function setGlobalVars (idb, initialConfig) {
    if (initialConfig) {
        setConfig(initialConfig);
    }
    const IDB = idb || (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
    function shim (name, value, propDesc) {
        if (!propDesc || !Object.defineProperty) {
            try {
                // Try setting the property. This will fail if the property is read-only.
                IDB[name] = value;
            } catch (e) {
                console.log(e);
            }
        }
        if (IDB[name] !== value && Object.defineProperty) {
            // Setting a read-only property failed, so try re-defining the property
            try {
                const desc = propDesc || {};
                desc.get = function () {
                    return value;
                };
                Object.defineProperty(IDB, name, desc);
                /*
                // Due to <https://github.com/axemclion/IndexedDBShim/issues/280>,
                //   there are problems for us to retain the descriptor
                //   and thus the fact that indexedDB is to be implemented
                //   as a getter (as expected in interface tests).
                if (name === 'indexedDB') {
                    console.log(Object.getOwnPropertyDescriptor(IDB, name));
                }
                */
            } catch (e) {
                // With `indexedDB`, PhantomJS fails here and below but
                //  not above, while Chrome is reverse (and Firefox doesn't
                //  get here since no WebSQL to use for shimming)
            }
        }
        if (IDB[name] !== value) {
            typeof console !== 'undefined' && console.warn && console.warn('Unable to shim ' + name);
        }
    }
    shim('shimIndexedDB', shimIndexedDB, {
        enumerable: false,
        configurable: true
    });
    if (IDB.shimIndexedDB) {
        IDB.shimIndexedDB.__useShim = function () { // Todo: Accept argument to set DOMException, DOMStringList, Event
            const shimIDBFactory = IDB.shimIndexedDB.modules.IDBFactory;
            if (CFG.win.openDatabase !== undefined) {
                // Polyfill ALL of IndexedDB, using WebSQL
                if (CFG.fullIDLSupport) {
                    // Slow per MDN so off by default! Though apparently needed for WebIDL: http://stackoverflow.com/questions/41927589/rationales-consequences-of-webidl-class-inheritance-requirements
                    const ShimEvent = IDB.shimIndexedDB.modules.ShimEvent;
                    const ShimEventTarget = IDB.shimIndexedDB.modules.ShimEventTarget;
                    Object.setPrototypeOf(shimIDBDatabase, ShimEventTarget);
                    Object.setPrototypeOf(shimIDBRequest, ShimEventTarget);
                    Object.setPrototypeOf(shimIDBTransaction, ShimEventTarget);
                    Object.setPrototypeOf(shimIDBVersionChangeEvent, ShimEvent);
                    Object.setPrototypeOf(ShimDOMException, Error);
                    Object.setPrototypeOf(ShimDOMException.prototype, Error.prototype);
                }
                [
                    ['indexedDB', shimIndexedDB],
                    ['IDBFactory', shimIDBFactory],
                    ['IDBDatabase', shimIDBDatabase],
                    ['IDBObjectStore', shimIDBObjectStore],
                    ['IDBIndex', shimIDBIndex],
                    ['IDBTransaction', shimIDBTransaction],
                    ['IDBCursor', shimIDBCursor],
                    ['IDBCursorWithValue', shimIDBCursorWithValue],
                    ['IDBKeyRange', shimIDBKeyRange],
                    ['IDBRequest', shimIDBRequest],
                    ['IDBOpenDBRequest', shimIDBOpenDBRequest],
                    ['IDBVersionChangeEvent', shimIDBVersionChangeEvent]
                ].forEach(([prop, obj]) => {
                    shim(prop, obj, {
                        enumerable: false,
                        configurable: true
                    });
                });
                if (CFG.addNonIDBGlobals && IDB.indexedDB && IDB.indexedDB.modules) {
                    // As `DOMStringList` exists per IDL (and Chrome) in the global
                    //   thread (but not in workers), we prefix the name to avoid
                    //   shadowing or conflicts
                    // Todo: We could provide an option to shim directly as
                    //   `DOMStringList` and thereby get the `enumerable` and readonly
                    //   settings out of the box
                    shim('ShimDOMStringList', IDB.indexedDB.modules.ShimDOMStringList, {
                        enumerable: false,
                        configurable: true
                    });
                    shim('ShimEvent', IDB.indexedDB.modules.ShimEvent);
                    shim('ShimCustomEvent', IDB.indexedDB.modules.ShimCustomEvent);
                    shim('ShimEventTarget', IDB.indexedDB.modules.ShimEventTarget);
                    shim('ShimDOMException', IDB.indexedDB.modules.ShimDOMException);
                }
            } else if (typeof IDB.indexedDB === 'object') {
                // Polyfill the missing IndexedDB features (no need for IDBEnvironment, the window containing indexedDB itself))
                polyfill(shimIDBCursor, shimIDBCursorWithValue, shimIDBDatabase, shimIDBFactory, shimIDBIndex, shimIDBKeyRange, shimIDBObjectStore, shimIDBRequest, shimIDBTransaction);
            }
        };

        IDB.shimIndexedDB.__debug = function (val) {
            CFG.DEBUG = val;
        };
        IDB.shimIndexedDB.__setConfig = setConfig;
        IDB.shimIndexedDB.__getConfig = function (prop) {
            if (!(prop in CFG)) {
                throw new Error(prop + ' is not a valid configuration property');
            }
            return CFG[prop];
        };
        IDB.shimIndexedDB.__setUnicodeIdentifiers = function (ui) {
            setConfig({
                UnicodeIDStart: ui.UnicodeIDStart,
                UnicodeIDContinue: ui.UnicodeIDContinue
            });
        };
    }

    // Workaround to prevent an error in Firefox
    if (!('indexedDB' in IDB) && typeof window !== 'undefined') { // 2nd condition avoids problems in Node
        IDB.indexedDB = IDB.indexedDB || IDB.webkitIndexedDB || IDB.mozIndexedDB || IDB.oIndexedDB || IDB.msIndexedDB;
    }

    // Detect browsers with known IndexedDb issues (e.g. Android pre-4.4)
    let poorIndexedDbSupport = false;
    if (typeof navigator !== 'undefined' && ( // Ignore Node or other environments
        (
            // Bad non-Chrome Android support
            navigator.userAgent.match(/Android (?:2|3|4\.[0-3])/) &&
            !navigator.userAgent.match(/Chrome/)
        ) ||
        (
            // Bad non-Safari iOS9 support (see <https://github.com/axemclion/IndexedDBShim/issues/252>)
            (navigator.userAgent.indexOf('Safari') === -1 || navigator.userAgent.indexOf('Chrome') > -1) && // Exclude genuine Safari: http://stackoverflow.com/a/7768006/271577
            // Detect iOS: http://stackoverflow.com/questions/9038625/detect-if-device-is-ios/9039885#9039885
            // and detect version 9: http://stackoverflow.com/a/26363560/271577
            (/(iPad|iPhone|iPod).* os 9_/i).test(navigator.userAgent) &&
            !window.MSStream // But avoid IE11
        )
    )) {
        poorIndexedDbSupport = true;
    }
    if (!CFG.DEFAULT_DB_SIZE) {
        CFG.DEFAULT_DB_SIZE = (
            ( // Safari currently requires larger size: (We don't need a larger size for Node as node-websql doesn't use this info)
                // https://github.com/axemclion/IndexedDBShim/issues/41
                // https://github.com/axemclion/IndexedDBShim/issues/115
                typeof navigator !== 'undefined' &&
                navigator.userAgent.indexOf('Safari') > -1 &&
                navigator.userAgent.indexOf('Chrome') === -1
            ) ? 25 : 4) * 1024 * 1024;
    }
    if ((!IDB.indexedDB || poorIndexedDbSupport) && CFG.win.openDatabase !== undefined) {
        IDB.shimIndexedDB.__useShim();
    } else {
        IDB.IDBDatabase = IDB.IDBDatabase || IDB.webkitIDBDatabase;
        IDB.IDBTransaction = IDB.IDBTransaction || IDB.webkitIDBTransaction || {};
        IDB.IDBCursor = IDB.IDBCursor || IDB.webkitIDBCursor;
        IDB.IDBKeyRange = IDB.IDBKeyRange || IDB.webkitIDBKeyRange;
    }
    return IDB;
}

export default setGlobalVars;
