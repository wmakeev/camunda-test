/**
 * main
 * Date: 02.02.14
 * Vitaliy V. Makeev (w.makeev@gmail.com)
 */

var fs = require('fs'),
    Engine = require('./vendor/camunda/Engine');

var processXml = fs.readFileSync('./res/processXml.bpmn', 'utf8');

var trace = [];

var instance = Engine.startInstance(processXml, {}, [
    {
        id: "task",
        "start": function (execution) {
            console.log(execution);
            trace.push("<br/> start " + execution.activityDefinition.id);
        }
    },
    {
        id: "end",
        "end": function (execution) {
            console.log(execution);
            trace.push("<br/> after " + execution.activityDefinition.id);
        }
    }
]);

instance.signal("task");

console.log(trace.join('\n'));