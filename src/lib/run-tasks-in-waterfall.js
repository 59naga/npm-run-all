/**
 * @author Toru Nagashima
 * @copyright 2015 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
import {PassThrough} from "stream";
import runTask from "./run-task";

/**
 * Run npm-scripts of given names in parallel with piping.
 *
 * @param {string} tasks - A list of npm-script name to run in sequencial.
 * @param {stream.Readable|null} stdin -
 *   A readable stream to send messages to stdin of child process.
 *   If this is `null`, ignores it.
 *   If this is `process.stdin`, inherits it.
 *   Otherwise, makes a pipe.
 * @param {stream.Writable|null} stdout -
 *   A writable stream to receive messages from stdout of child process.
 *   If this is `null`, cannot send.
 *   If this is `process.stdout`, inherits it.
 *   Otherwise, makes a pipe.
 * @param {stream.Writable|null} stderr -
 *   A writable stream to receive messages from stderr of child process.
 *   If this is `null`, cannot send.
 *   If this is `process.stderr`, inherits it.
 *   Otherwise, makes a pipe.
 * @param {string[]} prefixOptions -
 *   An array of options which are inserted before the task name.
 * @returns {Promise}
 *   A promise object which becomes fullfilled when all npm-scripts are completed.
 * @private
 */
export default function runTasksInSequencial(tasks, stdin, stdout, stderr, prefixOptions) {
    let input = new PassThrough();
    let output = stdout;

    // When one of tasks exited with non-zero, abort all tasks.
    // And wait for all tasks exit.
    let nonZeroExited = null;
    const taskPromises = [];
    for (let i = tasks.length - 1; i >= 0; --i) {
        taskPromises.push(
            runTask(tasks[i], input, output, stderr, prefixOptions)
        );
        output = input;
        input = new PassThrough();
    }

    if (stdin != null) {
        stdin.pipe(input);
    }

    const allPromise = Promise.all(taskPromises.map(p =>
        p.then(item => {
            if (nonZeroExited == null && item.code) {
                nonZeroExited = nonZeroExited || item;
                taskPromises.forEach(t => { t.abort(); });
            }
        })
    ));
    allPromise.catch(() => {
        taskPromises.forEach(t => { t.abort(); });
    });

    // Make fail if there are tasks that exited non-zero.
    return allPromise.then(() => {
        if (nonZeroExited != null) {
            throw new Error(
                `${nonZeroExited.task}: None-Zero Exit(${nonZeroExited.code});`);
        }
    });
}
