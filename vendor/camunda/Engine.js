/**
 * Engine
 * Date: 02.02.14
 * Vitaliy V. Makeev (w.makeev@gmail.com)
 */

var Executor = require('./Executor'),
    Transformer = require('./Transformer');

var _ = require('lodash');

module.exports = {

    getProcessDefinition: function (bpmnXml, listeners) {
        var transformer = new Transformer();

        transformer.parseListeners.splice(0,transformer.parseListeners.length);

        var listenerWrapper = function (listener) {
            return function(activityDefinition) {
                if (listener.id) {
                    if (activityDefinition.id == listener.id) {
                        activityDefinition.listeners.push(listener);
                    }
                } else {
                    activityDefinition.listeners = activityDefinition.listeners || []; // w.makeev: fix for global listener
                    activityDefinition.listeners.push(listener);
                }
            };
        };

        if (listeners) {
            for (var index in listeners) {
                var listener = listeners[index];
                transformer.parseListeners.push(listenerWrapper(listener));
            }
        }

        return transformer.transform(bpmnXml)[0];
    },

    getExecution: function (bpmnXml, listeners) {
        var processDefinition = this.getProcessDefinition(bpmnXml, listeners);
        return new Executor.ActivityExecution(processDefinition);
    },

    restoreExecution: function (instance, bpmnXml, listeners) {
        var processDefinition = this.getProcessDefinition(bpmnXml, listeners);

        var baseElementsHash = {};
        _(processDefinition.baseElements).each(function (baseElement) {
            baseElementsHash[baseElement.id] = baseElement;
        });
        baseElementsHash[processDefinition.id] = processDefinition;

        function _restoreState(activityDefinition, activityInstance, parentExecution) {
            var activityExecution = new Executor.ActivityExecution(activityDefinition, parentExecution);

            activityExecution.isEnded = activityInstance.isEnded;
            activityExecution.startDate = activityInstance.startDate;
            activityExecution.endDate = activityInstance.endDate;
            //TODO restore variables

            var activities = activityInstance.activities;
            if (activities && activities.length > 0) {
                for (var i = 0; i < activities.length; i++) {
                    activityExecution.activityExecutions[i] =
                        _restoreState(
                            baseElementsHash[activities[i].activityId],
                            activities[i],
                            activityExecution
                        );
                }
            }

            return activityExecution;
        }

        return _restoreState(processDefinition, instance);
    }

};