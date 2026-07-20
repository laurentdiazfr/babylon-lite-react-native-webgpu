import type { GestureResponderEvent } from "react-native";
import type { NativeCanvas, RNCanvasContext } from "react-native-webgpu";

type Listener = EventListenerOrEventListenerObject;

/**
 * Wraps a react-native-webgpu canvas so `@babylonjs/lite` can treat it like an
 * HTMLCanvasElement: `getContext("webgpu")`, layout size, and pointer/touch
 * listeners (NativeCanvas stubs those as no-ops).
 */
export class BabylonRenderCanvas {
    private readonly listeners = new Map<string, Set<Listener>>();
    // NativeCanvas exposes clientWidth/Height as getters only — keep layout size here.
    private _clientWidth: number;
    private _clientHeight: number;

    constructor(
        private readonly native: NativeCanvas,
        private readonly gpuContext: RNCanvasContext,
    ) {
        this._clientWidth = native.clientWidth;
        this._clientHeight = native.clientHeight;
    }

    getContext(contextId: string): RNCanvasContext | null {
        return contextId === "webgpu" ? this.gpuContext : null;
    }

    get width() {
        return this.native.width;
    }

    set width(width: number) {
        this.native.width = width;
    }

    get height() {
        return this.native.height;
    }

    set height(height: number) {
        this.native.height = height;
    }

    get clientWidth() {
        return this._clientWidth;
    }

    set clientWidth(width: number) {
        this._clientWidth = width;
    }

    get clientHeight() {
        return this._clientHeight;
    }

    set clientHeight(height: number) {
        this._clientHeight = height;
    }

    setAttribute(_name: string, _value: string) {
        // createEngine tags DOM canvases; no-op on native.
    }

    addEventListener(type: string, listener: Listener) {
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(listener);
    }

    removeEventListener(type: string, listener: Listener) {
        this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event: Event): boolean {
        const set = this.listeners.get(event.type);
        if (!set) {
            return true;
        }
        for (const listener of set) {
            if (typeof listener === "function") {
                listener.call(this, event);
            } else {
                listener.handleEvent(event);
            }
        }
        return !event.defaultPrevented;
    }

    setPointerCapture(_pointerId: number) { }

    releasePointerCapture(_pointerId: number) { }

    /** Forward React Native responder events into DOM-like pointer + touch events. */
    handleResponderGrant(e: GestureResponderEvent) {
        this.emitPointer(e, "pointerdown");
        this.emitTouch(e, "touchstart");
    }

    handleResponderMove(e: GestureResponderEvent) {
        this.emitPointer(e, "pointermove");
        this.emitTouch(e, "touchmove");
    }

    handleResponderRelease(e: GestureResponderEvent) {
        this.emitPointer(e, "pointerup");
        this.emitTouch(e, "touchend");
    }

    private emitPointer(e: GestureResponderEvent, type: string) {
        const { pageX, pageY, identifier } = e.nativeEvent;
        this.dispatchEvent(
            Object.assign(new Event(type), {
                pointerId: identifier ?? 1,
                button: 0,
                clientX: pageX,
                clientY: pageY,
                preventDefault() { },
            }) as Event,
        );
    }

    private emitTouch(e: GestureResponderEvent, type: string) {
        const touches = Array.from(e.nativeEvent.touches ?? []).map((t) => ({
            identifier: t.identifier,
            clientX: t.pageX,
            clientY: t.pageY,
        }));
        const changed = Array.from(e.nativeEvent.changedTouches ?? []).map((t) => ({
            identifier: t.identifier,
            clientX: t.pageX,
            clientY: t.pageY,
        }));
        this.dispatchEvent(
            Object.assign(new Event(type), {
                touches,
                changedTouches: changed,
                preventDefault() { },
            }) as Event,
        );
    }
}

export function createBabylonCanvas(
    context: RNCanvasContext,
): BabylonRenderCanvas {
    return new BabylonRenderCanvas(context.canvas as NativeCanvas, context);
}
