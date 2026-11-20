import { ipcMain } from 'electron';
import { basename, join } from 'path';
import PluginOption from '../../interfaces/PluginSettingSchema';
import { ENHANCED_PLUGINS_API, FILE_EXTENSIONS } from '../../constants';
import Properties from '../../core/Properties';
import logger from '../../utils/logger';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const registeredPluginSchemas: Record<string, PluginOption[]> = {};

function safePluginName(name: unknown): string {
    return typeof name === 'string' ? basename(name.trim()) : '';
}

function configPathFor(pluginName: string): string {
    return join(Properties.pluginsPath, `${pluginName}${FILE_EXTENSIONS.PLUGIN_CONFIG}`);
}

export function readConfigObject(configPath: string): Record<string, unknown> {
    if (!existsSync(configPath)) return {};
    try {
        const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch (err) {
        logger.warn(`Corrupted plugin config at ${configPath}; falling back to defaults: ${(err as Error).message}`);
        return {};
    }
}

export function setupPluginSettingsAPI() {
    ipcMain.handle(ENHANCED_PLUGINS_API.GET_SETTING, (_, rawPluginName, key) => {
        const pluginFileName = safePluginName(rawPluginName);
        if (!pluginFileName || typeof key !== 'string') return Promise.reject(new Error("Invalid plugin file name."));
        return readConfigObject(configPathFor(pluginFileName))[key] ?? null;
    });

    ipcMain.handle(ENHANCED_PLUGINS_API.GET_SETTINGS, (_, rawPluginName) => {
        const pluginFileName = safePluginName(rawPluginName);
        if (!pluginFileName) return Promise.reject(new Error("Invalid plugin file name."));
        return readConfigObject(configPathFor(pluginFileName));
    });

    ipcMain.handle(ENHANCED_PLUGINS_API.SAVE_SETTING, (event, rawPluginName, key, value) => {
        const pluginFileName = safePluginName(rawPluginName);
        if (!pluginFileName || typeof key !== 'string') return false;

        const configPath = configPathFor(pluginFileName);
        const jsonConfig = readConfigObject(configPath);
        jsonConfig[key] = value;

        writeFileSync(configPath, JSON.stringify(jsonConfig, null, 2));

        const channel = `${ENHANCED_PLUGINS_API.ON_SETTINGS_SAVED}:${pluginFileName}`;
        event.sender.send(channel, jsonConfig);

        return true;
    });

    ipcMain.handle(ENHANCED_PLUGINS_API.REGISTER_SETTINGS, (_, rawPluginName, pluginSchema) => {
        const pluginFileName = safePluginName(rawPluginName);
        if (!pluginFileName || !Array.isArray(pluginSchema)) {
            logger.error("Invalid plugin options schema received. Expected an array of options.");
            return Promise.reject(new Error("Invalid plugin options schema. Ensure it follows the correct structure."));
        }

        let pluginFile = existsSync(join(Properties.pluginsPath, `${pluginFileName}${FILE_EXTENSIONS.PLUGIN}`));
        if(!pluginFile) {
            logger.error(`Plugin file not found for registering options: ${pluginFileName}${FILE_EXTENSIONS.PLUGIN}`);
            return Promise.reject(new Error("Plugin file not found."));
        }

        const configPath = configPathFor(pluginFileName);
        if(!existsSync(configPath)) {
            logger.info(`No config found for plugin ${pluginFileName}. Creating new config file.`);
            writeFileSync(configPath, JSON.stringify({}));
        }
        
        if(registeredPluginSchemas[pluginFileName]) {
            return Promise.reject(`Plugin ${pluginFileName} already has a settings schema registered!`);
        }

        registeredPluginSchemas[pluginFileName] = pluginSchema;
        logger.info(`Registered options for plugin ${pluginFileName}: ${JSON.stringify(pluginSchema)}`);
        
        return true;
    });

    ipcMain.handle(ENHANCED_PLUGINS_API.CLEAR_REGISTERED_SETTINGS, (_, rawPluginName) => {
        const pluginFileName = safePluginName(rawPluginName);
        if(pluginFileName && registeredPluginSchemas[pluginFileName]) {
            delete registeredPluginSchemas[pluginFileName];
            return true;
        }

        return false;
    });

    ipcMain.handle(ENHANCED_PLUGINS_API.GET_REGISTERED_SETTINGS, (_, rawPluginName) => {
        const pluginFileName = safePluginName(rawPluginName);
        if (!pluginFileName) {
            logger.error("Invalid plugin file name received for getting options.");
            return Promise.reject("Invalid plugin file name.");
        }
        
        return registeredPluginSchemas[pluginFileName] || null;
    });
}