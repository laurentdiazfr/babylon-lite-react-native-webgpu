import { Platform } from "react-native";

const BUFFER_KEY = "__rnArrayBuffer";

type BlobWithBuffer = Blob & { [BUFFER_KEY]?: ArrayBuffer };

/**
 * React Native's Blob cannot be constructed from ArrayBuffer parts.
 * Babylon Lite's glTF loader does `new Blob([slice])` then `createImageBitmap(blob)`.
 * react-native-webgpu's createImageBitmap already accepts ArrayBuffer directly —
 * so we stash the bytes on the Blob and unwrap them in createImageBitmap.
 */
export function installBlobArrayBufferPolyfill(): void {
    if (Platform.OS === "web") {
        return;
    }

    const g = globalThis as typeof globalThis & {
        __blobArrayBufferPolyfillInstalled?: boolean;
    };
    if (g.__blobArrayBufferPolyfillInstalled) {
        return;
    }

    try {
        // Probe: supported runtimes succeed here.
        void new Blob([new Uint8Array([0, 0, 0, 0])]);
        g.__blobArrayBufferPolyfillInstalled = true;
        return;
    } catch {
        // Need polyfill.
    }

    const NativeBlob = Blob;

    function mergeArrayBuffers(parts: BlobPart[]): ArrayBuffer {
        const views: Uint8Array[] = [];
        let total = 0;
        for (const part of parts) {
            let view: Uint8Array;
            if (part instanceof ArrayBuffer) {
                view = new Uint8Array(part);
            } else if (ArrayBuffer.isView(part)) {
                view = new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
            } else {
                throw new Error("Expected ArrayBuffer blob parts");
            }
            views.push(view);
            total += view.byteLength;
        }
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const view of views) {
            merged.set(view, offset);
            offset += view.byteLength;
        }
        return merged.buffer;
    }

    function BlobPolyfill(
        this: BlobWithBuffer,
        parts: BlobPart[] = [],
        options?: BlobPropertyBag,
    ) {
        const allBinary =
            parts.length > 0 &&
            parts.every(
                (part) => part instanceof ArrayBuffer || ArrayBuffer.isView(part),
            );

        if (!allBinary) {
            return new NativeBlob(parts as BlobPart[], options);
        }

        // Empty native blob shell + attached bytes for createImageBitmap unwrap.
        const blob = new NativeBlob([], options) as BlobWithBuffer;
        blob[BUFFER_KEY] = mergeArrayBuffers(parts);
        return blob;
    }

    BlobPolyfill.prototype = NativeBlob.prototype;
    g.Blob = BlobPolyfill as unknown as typeof Blob;

    const nativeCreateImageBitmap = g.createImageBitmap.bind(g);
    g.createImageBitmap = ((
        image: ImageBitmapSource,
        options?: ImageBitmapOptions,
    ) => {
        const buffer = (image as BlobWithBuffer)?.[BUFFER_KEY];
        if (buffer) {
            return nativeCreateImageBitmap(buffer as unknown as ImageBitmapSource);
        }
        return nativeCreateImageBitmap(image, options);
    }) as typeof createImageBitmap;

    g.__blobArrayBufferPolyfillInstalled = true;
}
