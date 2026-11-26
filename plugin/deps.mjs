// SPDX-License-Identifier: Apache-2.0
// Loaded with `node --import` when Linken runs as a Claude Code plugin. A package that is not found next to the
// server is looked up in LINKEN_DEPS, the plugin's data folder, where plugin/deps.sh installed it. Nothing else changes.
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const deps = process.env.LINKEN_DEPS;
const parentURL = deps ? pathToFileURL(`${deps}/package.json`).href : undefined;
const bare = (specifier) => !/^(\.|\/|node:|file:|data:)/.test(specifier);

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!parentURL || !bare(specifier) || error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return next(specifier, { ...context, parentURL });
    }
  },
});
