/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { defaultOptions } from './meta.js';
import { simd, threads } from './wasm-feature-detect.js';
import { initEmscriptenModule } from './utils.js';
let emscriptenModule;
const isRunningInNode = () => typeof process !== 'undefined' &&
    process.release &&
    process.release.name === 'node';
const isRunningInCloudflareWorker = () => { var _a; return ((_a = globalThis.caches) === null || _a === void 0 ? void 0 : _a.default) !== undefined; };
export async function init(module, moduleOptionOverrides) {
    let actualModule = module;
    let actualOptions = moduleOptionOverrides;
    // If only one argument is provided and it's not a WebAssembly.Module
    if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
        actualModule = undefined;
        actualOptions = module;
    }
    if (!isRunningInNode() &&
        !isRunningInCloudflareWorker() &&
        (await threads())) {
        if (await simd()) {
            const jxlEncoder = await import('./codec/enc/jxl_enc_mt_simd.js');
            emscriptenModule = initEmscriptenModule(jxlEncoder.default, actualModule, actualOptions);
            return emscriptenModule;
        }
        const jxlEncoder = await import('./codec/enc/jxl_enc_mt.js');
        emscriptenModule = initEmscriptenModule(jxlEncoder.default, actualModule, actualOptions);
        return emscriptenModule;
    }
    const jxlEncoder = await import('./codec/enc/jxl_enc.js');
    emscriptenModule = initEmscriptenModule(jxlEncoder.default, actualModule, actualOptions);
    return emscriptenModule;
}
export default async function encode(data, options = {}) {
    if (!emscriptenModule)
        emscriptenModule = init();
    const module = await emscriptenModule;
    const _options = { ...defaultOptions, ...options };
    const resultView = module.encode(data.data, data.width, data.height, _options);
    if (!resultView) {
        throw new Error('Encoding error.');
    }
    return resultView.buffer;
}
