/**
 * The BPMN 2.0 activity type module.
 *
 * This module provides the BPMN 2.0 specific runtime behavior
 *
 * @author Daniel Meyer
 */

module.exports = function(CAM) {

    // variables & conditions //////////////////////////////////////////

    var VariableScope = require('./VariableScope');

    function evaluateCondition(condition, activityExecution) {
        return new VariableScope(activityExecution).evaluateCondition(condition);
    }

    // the default outgoing behavior for BPMN 2.0 activities //////////

    function leave(activityExecution) {

        // SEPC p.427 §13.2.1
        // Multiple outgoing Sequence Flows behaves as a parallel split.
        // Multiple outgoing Sequence Flows with conditions behaves as an inclusive split.
        // A mix of multiple outgoing Sequence Flows with and without conditions is considered as a combination of a parallel and an inclusive split

        var sequenceFlowsToTake = [];
        var availableSequenceFlows = CAM.getSequenceFlows(activityExecution.activityDefinition,
            activityExecution.parentExecution.activityDefinition);
        var defaultFlowId = activityExecution.activityDefinition.default;

        var defaultFlow = null;
        var noConditionalFlowActivated = true;

        for(var i =0; i<availableSequenceFlows.length; i++) {
            var sequenceFlow = availableSequenceFlows[i];

            if(!!defaultFlowId && defaultFlowId == sequenceFlow.id) {
                defaultFlow = sequenceFlow;

            } else if(!sequenceFlow.condition) {
                sequenceFlowsToTake.push(sequenceFlow);

            } else if(evaluateCondition(sequenceFlow.condition, activityExecution)) {
                sequenceFlowsToTake.push(sequenceFlow);
                noConditionalFlowActivated = false;
            }

        }

        // the default flow is only activated if all conditional flows are false
        if(noConditionalFlowActivated && !!defaultFlow) {
            sequenceFlowsToTake.push(defaultFlow);
        }

        activityExecution.takeAll(sequenceFlowsToTake);
    }

    // actual activity types //////////////////////////////////////////

    var process = {
        "execute" : function(activityExecution) {

            // find start events
            var startEvents = CAM.getActivitiesByType(activityExecution.activityDefinition, "startEvent");

            if(startEvents.length == 0) {
                throw "process must have at least one start event";
            }

            // activate all start events
            activityExecution.executeActivities(startEvents);
        }
    };

    var startEvent = {
        "execute" : function(activityExecution) {
            leave(activityExecution);
        }
    };

    var intermediateThrowEvent = {
        "execute" : function(activityExecution) {
            leave(activityExecution);
        }
    };

    var endEvent = {
        "execute" : function(activityExecution) {
            activityExecution.end(true);
        }
    };

    var task = {
        "execute" : function(activityExecution) {
            leave(activityExecution);
        }
    };

    var userTask = {
        "execute" : function(activityExecution) {
            // wait state
            debugger;
        },
        "signal" : function(activityExecution) {
            leave(activityExecution);
        }
    };

    var serviceTask = {
        "execute" : function(activityExecution) {
            leave(activityExecution);
        }
    };

    /**
     * implementation of the exclusive gateway
     */
    var exclusiveGateway = {
        "execute" : function(activityExecution) {
            var outgoingSequenceFlows = activityExecution.activityDefinition.sequenceFlows;

            var sequenceFlowToTake,
                defaultFlow;

            for(var i = 0; i<outgoingSequenceFlows.length; i++) {
                var sequenceFlow = outgoingSequenceFlows[i];
                if(!sequenceFlow.condition) {
                    // we make sure at deploy time that there is only a single sequence flow without a condition
                    defaultFlow = sequenceFlow;
                } else if(evaluateCondition(sequenceFlow.condition, activityExecution)) {
                    sequenceFlowToTake = sequenceFlow;
                    break;
                }
            }

            if(!sequenceFlowToTake) {
                if(!defaultFlow) {
                    throw "Cannot determine outgoing sequence flow for exclusive gateway '"+activityExecution.activityDefinition+"': " +
                        "All conditions evaluate to false and a default sequence flow has not been specified."
                } else {
                    sequenceFlowToTake = defaultFlow;
                }
            }

            activityExecution.take(sequenceFlowToTake);
        }
    };

    /**
     * implementation of the parallel gateway
     */
    var parallelGateway = {
        "execute" : function(activityExecution) {
            var outgoingSequenceFlows = CAM.getSequenceFlows(activityExecution.activityDefinition,
                activityExecution.parentExecution.activityDefinition);

            // join
            var executionsToJoin = [];
            var parent = activityExecution.parentExecution;
            for(var i=0; i<parent.activityExecutions.length; i++) {
                var sibling = parent.activityExecutions[i];
                if(sibling.activityDefinition == activityExecution.activityDefinition && !sibling.isEnded) {
                    executionsToJoin.push(sibling);
                }
            }

            if(executionsToJoin.length == activityExecution.activityDefinition.cardinality) {
                // end all joined executions but this one,
                for(var i=0; i<executionsToJoin.length; i++) {
                    var joinedExecution = executionsToJoin[i];
                    if(joinedExecution != activityExecution) {
                        joinedExecution.end(false);
                    }
                }
                // continue with this execution
                activityExecution.takeAll(outgoingSequenceFlows);
            }

        }
    };

    // register activity types
    CAM.activityTypes["startEvent"] = startEvent;
    CAM.activityTypes["intermediateThrowEvent"] = intermediateThrowEvent;
    CAM.activityTypes["endEvent"] = endEvent;
    CAM.activityTypes["exclusiveGateway"] = exclusiveGateway;
    CAM.activityTypes["task"] = task;
    CAM.activityTypes["userTask"] = userTask;
    CAM.activityTypes["serviceTask"] = serviceTask;
    CAM.activityTypes["process"] = process;
    CAM.activityTypes["parallelGateway"] = parallelGateway;

};

