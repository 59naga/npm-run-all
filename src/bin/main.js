/**
 * @author Toru Nagashima
 * @copyright 2015 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
/* eslint no-process-env: 0 */
import runAll from "../lib/npm-run-all";

const START_PROMISE = Promise.resolve(null);
const OVERWRITE_OPTION = /^--([^:]+?):([^=]+?)(?:=(.+))?$/;
const CONFIG_PATTERN = /^npm_package_config_(.+)$/;

/**
 * Overwrites a specified package config.
 *
 * @param {object} config - A config object to be overwritten.
 * @param {string} packageName - A package name to overwrite.
 * @param {string} variable - A variable name to overwrite.
 * @param {string} value - A new value to overwrite.
 * @returns {void}
 */
function overwriteConfig(config, packageName, variable, value) {
    const scope = config[packageName] || (config[packageName] = {}); // eslint-disable-line no-param-reassign
    scope[variable] = value;
}

/**
 * Creates a package config object.
 * This checks `process.env` and creates the default value.
 *
 * @returns {object} Created config object.
 */
function createPackageConfig() {
    const retv = {};
    const packageName = process.env.npm_package_name;
    if (!packageName) {
        return retv;
    }

    for (const key of Object.keys(process.env)) {
        const m = CONFIG_PATTERN.exec(key);
        if (m != null) {
            overwriteConfig(retv, packageName, m[1], process.env[key]);
        }
    }

    return retv;
}

/**
 * Parses arguments.
 *
 * @param {string[]} args - Arguments to parse.
 * @returns {{parallel: boolean, patterns: string[], packageConfig: object}[]} A running plan.
 */
function parse(args) {
    const packageConfig = createPackageConfig();
    const queue = [{type: "sequential", patterns: [], packageConfig}];

    for (let i = 0; i < args.length; ++i) {
        const arg = args[i];

        switch (arg) {
            case "-s":
            case "--sequential":
            case "--serial":
                if (queue[queue.length - 1].type !== "sequential") {
                    queue.push({type: "sequential", patterns: [], packageConfig});
                }
                break;

            case "-p":
            case "--parallel":
                queue.push({type: "parallel", patterns: [], packageConfig});
                break;

            case "-w":
            case "--waterfall":
                queue.push({type: "waterfall", patterns: [], packageConfig});
                break;

            case "--silent":
                // do nothing.
                break;

            default: {
                const matched = OVERWRITE_OPTION.exec(arg);
                if (matched) {
                    overwriteConfig(
                        packageConfig,
                        matched[1],
                        matched[2],
                        matched[3] || args[++i]
                    );
                }
                else if (arg[0] === "-") {
                    throw new Error(`Invalid Option: ${arg}`);
                }
                else {
                    queue[queue.length - 1].patterns.push(arg);
                }
                break;
            }
        }
    }

    return queue;
}

/**
 * Parses arguments, then run specified npm-scripts.
 *
 * @param {string[]} args - Arguments to parse.
 * @param {stream.Readable} stdin - A readable stream to input.
 * @param {stream.Writable} stdout - A writable stream to print logs.
 * @param {stream.Writable} stderr - A writable stream to print errors.
 * @returns {Promise} A promise which comes to be fulfilled when all npm-scripts are completed.
 * @private
 */
export default function npmRunAll(args, stdin, stdout, stderr) {
    try {
        const silent = (
            args.indexOf("--silent") !== -1 ||
            process.env.npm_config_loglevel === "silent"
        );

        return parse(args).reduce(
            (prev, {patterns, type, packageConfig}) => {
                if (patterns.length === 0) {
                    return prev;
                }
                return prev.then(() => runAll(
                    patterns,
                    {
                        type,
                        stdout,
                        stderr,
                        stdin,
                        packageConfig,
                        silent
                    }
                ));
            },
            START_PROMISE
        );
    }
    catch (err) {
        return Promise.reject(err);
    }
}
