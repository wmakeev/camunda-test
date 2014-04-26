/**
 * main
 * Date: 02.02.14
 * Vitaliy V. Makeev (w.makeev@gmail.com)
 */

var fs = require('fs'),
    Engine = require('./vendor/camunda/Engine');

var processXml = fs.readFileSync('./res/bpmn/diagram-01.bpmn', 'utf8');

var trace = [];

var variables = {
    a: 'some var',
    b: { c: 10 }
};

var listeners = [
    {
        //'id': 'Task_1',
        'start': function (execution) {
            trace.push("start: " + execution.activityDefinition.id);
        },
        'end': function (execution) {
            trace.push("  end: " + execution.activityDefinition.id);
        }
    },
    {
        'id': 'Task_1',
        'start': function (execution) {
            trace.push("action: Сделали работу");
        },
        'end': function (execution) {
            //trace.push("  end: " + execution.activityDefinition.id);
        }
    }
];

var execution1 = Engine.getExecution(processXml, listeners);
// Указываем переменные процесса
execution1.variables = variables;
// Запусакем процесс
execution1.start();


// Получаем состояние поцесса
var executionInstance1 = execution1.getActivityInstance();
// Сериализуем состояние поцесса в JSON
var presistenceObj = JSON.stringify(executionInstance1);


// Восстанавливаем процесс
var execution2 = Engine.restoreExecution(
    JSON.parse(presistenceObj),
    processXml,
    listeners
);
// Указываем переменные процесса
execution2.variables.userAction = 'Ответ пользователя';
// Продолжаем выполнение процесса
execution2.signal("UserTask_1");

var executionInstance2 = execution2.getActivityInstance();
//...



console.log(trace.join('\n'));