import { useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Canvas, type CanvasRef } from "react-native-webgpu";
import {
    createEngine,
    createSceneContext,
    createDefaultCamera,
    createHemisphericLight,
    loadGltf,
    addToScene,
    attachControl,
    registerScene,
    renderFrame,
    resizeEngine,
    stopEngine,
    disposeEngine,
    type EngineContext,
} from "@babylonjs/lite";

import {
    BabylonRenderCanvas,
    createBabylonCanvas,
} from "./babylon-canvas";
import { installBlobArrayBufferPolyfill } from "./rn-blob-polyfill";

// glTF embedded textures use `new Blob([ArrayBuffer])` — unsupported on RN.
installBlobArrayBufferPolyfill();

const GLB_URL = "https://playground.babylonjs.com/scenes/BoomBox.glb";

/** RN WebGPU does not default usage to RENDER_ATTACHMENT (browsers do). */
function patchConfigureUsage(gpuContext: GPUCanvasContext) {
    const configure = gpuContext.configure.bind(gpuContext);
    gpuContext.configure = (descriptor: GPUCanvasConfiguration) => {
        configure({
            ...descriptor,
            usage:
                descriptor.usage ??
                (GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC),
        });
    };
}

function startEngineWithPresent(
    engine: EngineContext,
    present: () => void,
): Promise<void> {
    const internals = engine as EngineContext & {
        _animFrameId: number;
        _renderFn: ((now: number) => void) | null;
    };

    return new Promise((resolve) => {
        let first = true;
        let lastTime = 0;
        internals._renderFn = (now: number) => {
            const delta = first ? 0 : lastTime > 0 ? now - lastTime : 16.667;
            lastTime = now;
            // resizeEngine(engine);
            renderFrame(engine, delta);
            present();
            if (first) {
                first = false;
                resolve();
            }
            internals._animFrameId = requestAnimationFrame(internals._renderFn!);
        };
        internals._animFrameId = requestAnimationFrame(internals._renderFn);
    });
}

export const BabylonLite = () => {
    const canvasRef = useRef<CanvasRef>(null);
    const babylonCanvasRef = useRef<BabylonRenderCanvas | null>(null);
    const [layout, setLayout] = useState<{ width: number; height: number } | null>(
        null,
    );

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setLayout({ width, height });
        }
    };

    useEffect(() => {
        if (!layout) {
            return;
        }

        let cancelled = false;
        let engine: EngineContext | null = null;
        let detachControl: (() => void) | null = null;

        const run = async () => {
            globalThis.devicePixelRatio = 1;

            const gpuContext = canvasRef.current!.getContext("webgpu")!;
            patchConfigureUsage(gpuContext);

            const canvas = createBabylonCanvas(gpuContext);
            babylonCanvasRef.current = canvas;
            canvas.clientWidth = layout.width;
            canvas.clientHeight = layout.height;
            canvas.width = Math.max(1, Math.floor(layout.width));
            canvas.height = Math.max(1, Math.floor(layout.height));

            engine = await createEngine(canvas as unknown as HTMLCanvasElement, {
                msaaSamples: 1,
                maxDevicePixelRatio: 1,
            });
            if (cancelled) {
                disposeEngine(engine);
                return;
            }

            const scene = createSceneContext(engine);
            scene.clearColor = { r: 0.15, g: 0.25, b: 0.45, a: 1 };

            addToScene(scene, createHemisphericLight([0, 1, 0], 1.0));

            console.log("[babylon] loading glb…");
            const asset = await loadGltf(engine, GLB_URL);
            if (cancelled) {
                disposeEngine(engine);
                return;
            }
            addToScene(scene, asset);
            console.log("[babylon] glb loaded");

            const camera = createDefaultCamera(scene);
            detachControl = attachControl(
                camera,
                canvas as unknown as HTMLCanvasElement,
                scene,
            );

            await registerScene(scene);
            await startEngineWithPresent(engine, () => gpuContext.present());
        };

        run().catch(console.error);

        return () => {
            cancelled = true;
            detachControl?.();
            babylonCanvasRef.current = null;
            if (engine) {
                stopEngine(engine);
                disposeEngine(engine);
            }
        };
    }, [layout]);

    return (
        <View
            style={{ flex: 1 }}
            onLayout={onLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) =>
                babylonCanvasRef.current?.handleResponderGrant(e)
            }
            onResponderMove={(e) => babylonCanvasRef.current?.handleResponderMove(e)}
            onResponderRelease={(e) =>
                babylonCanvasRef.current?.handleResponderRelease(e)
            }
            onResponderTerminate={(e) =>
                babylonCanvasRef.current?.handleResponderRelease(e)
            }
        >
            <Canvas ref={canvasRef} style={{ flex: 1 }} />
        </View>
    );
};

export default BabylonLite;
