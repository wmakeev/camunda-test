/* Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var _ = require('lodash');

/**
 * The core process engine.
 * @author Daniel Meyer
 */

module.exports = function(CAM) {

    /**
     * the activity types to be used by the process engine.
     * An activity type realizes the process language specific
     * behavior of an activity.
     *
     */
    var activityTypes = { };

    var LISTENER_START = "start";
    var LISTENER_END = "end";
    var LISTENER_TAKE = "take";

    // static utility functions ////////////////////////////////////

    var getActivitiesByType = function(activityDefinition, type, recursive) {
        var baseElements = [];
        for (var i = 0; i < activityDefinition.baseElements.length; i++) {
            var childActivity = activityDefinition.baseElements[i];
            if(!!childActivity.type && childActivity.type == type){
                baseElements.push(childActivity);
                if(recursive) {
                    baseElements = baseElements.concat(getActivitiesByType(childActivity, type, recursive));
                }
            }
        }
        return baseElements;
    };

    var getActivityById = function(activityDefinition, id) {
        for (var i = 0; i < activityDefinition.baseElements.length; i++) {
            var chidActivity = activityDefinition.baseElements[i];
            if(!!chidActivity.id && chidActivity.id == id){
                return chidActivity;
            }
        }
        return null;
    };

    var getActivityType = function(activityDefinition) {
        var type = activityDefinition.type;
        if(!!type) {
            return activityTypes[type];
        } else {
            return null;
        }
    };

    var getSequenceFlows = function(activityDefinition, scopeActivity) {
        var result = [];
        if(!!activityDefinition.outgoing) {
            var outgoingSequenceFlowIds = activityDefinition.outgoing;

            for (var i = 0; i < outgoingSequenceFlowIds.length; i++) {
                var sequenceFlowId = outgoingSequenceFlowIds[i];
                result.push(getActivityById(scopeActivity, sequenceFlowId));
            }
        }

        return result;
    };


    ///////////////////////////////////////////////////////////////
    // constructor
    function ActivityExecution(activityDefinition, parentExecution) {

        if (!activityDefinition) {
            throw new ExecutionException("Activity definition cannot be null", this);
        }

        this.activityDefinition = activityDefinition;
        // a list of child activity executions
        this.activityExecutions = [];
        // indicates whether the execution has been ended
        this.isEnded = false;
        // the parent execution
        this.parentExecution = parentExecution;
        // the variables of this execution
        this.variables = {};

        this.startDate = null;
        this.endDate = null;
    }

    ActivityExecution.prototype.bindVariableScope = function (scope) {
        if (!!this.parentExecution) {
            this.parentExecution.bindVariableScope(scope);
        }
        var variables = this.variables;
        for (var varName in variables) {
            scope[varName] = variables[varName];
        }
    };

    ActivityExecution.prototype.executeActivities = function (activities) {
        for (var i = 0; i < activities.length; i++) {
            this.executeActivity(activities[i]);
        }
    };

    ActivityExecution.prototype.executeActivity = function (activity, sequenceFlow) {
        var childExecutor = new ActivityExecution(activity, this);
        this.activityExecutions.push(childExecutor);
        if (!!sequenceFlow) {
            childExecutor.incomingSequenceFlowId = sequenceFlow.id;
        }
        childExecutor.start();
    };

    ActivityExecution.prototype.invokeListeners = function (type, sequenceFlow) {
        var listeners = this.activityDefinition.listeners;
        if (!!listeners) {
            for (var i = 0; i < listeners.length; i++) {
                var listener = listeners[i];
                if (!!listener[type]) {
                    listener[type](this, sequenceFlow);
                }
            }
        }
    };

    ActivityExecution.prototype.start = function () {
        this.startDate = new Date();

        // invoke listeners on activity start
        this.invokeListeners(LISTENER_START);

        // if the activity is async, we do not execute it right away
        // but simpley return. Execution can be continued using the
        // continue() function
        if (!!this.activityDefinition.asyncCallback) {
            this.activityDefinition.asyncCallback(this);
        } else {
            this.continue();
        }
    };

    ActivityExecution.prototype.continue = function () {
        // execute activity type
        var activityType = getActivityType(this.activityDefinition);
        if (!!activityType) {
            activityType.execute(this);
        } else {
            throw new Error('Type [' + this.activityDefinition.type + '] not found. Activity [' + this.activityDefinition.id + ']');
        }
    };

    ActivityExecution.prototype.end = function (notifyParent) {
        this.isEnded = true;
        this.endDate = new Date();

        // invoke listeners on activity end
        this.invokeListeners(LISTENER_END);

        if (!!this.parentExecution) {
            // remove from parent
            var parent = this.parentExecution;
            // notify parent
            if (notifyParent) {
                parent.hasEnded(this);
            }
        }
    };

    ActivityExecution.prototype.takeAll = function (sequenceFlows) {
        for (var i = 0; i < sequenceFlows.length; i++) {
            this.take(sequenceFlows[i]);
        }
    };

    ActivityExecution.prototype.take = function (sequenceFlow) {
        var toId = sequenceFlow.targetRef;
        var toActivity = getActivityById(this.parentExecution.activityDefinition, toId);
        if (!toActivity) {
            throw new ExecutionException("cannot find activity with id '" + toId + "'");
        }
        // end this activity
        this.end(false);

        // invoke listeners on sequence flow take
        this.invokeListeners(LISTENER_TAKE, sequenceFlow);

        // have the parent execute the next activity
        this.parentExecution.executeActivity(toActivity, sequenceFlow);
    };

    ActivityExecution.prototype.signal = function (definitionId) {
        var signalFn = function (execution) {
            if (execution.isEnded) {
                throw new ExecutionException("cannot signal an ended activity instance", execution);
            }
            var type = getActivityType(execution.activityDefinition);
            if (!!type.signal) {
                type.signal(execution);
            } else {
                execution.end();
            }
        };

        if (definitionId) {
            for (var index in this.activityExecutions) {
                var execution = this.activityExecutions[index];
                if (execution.activityDefinition.id == definitionId) {
                    signalFn(execution);
                    break;
                }
            }
        } else {
            signalFn(this);
        }
    };

    /**
     * called by the child activity executors when they are ended
     */
    ActivityExecution.prototype.hasEnded = function (activityExecution) {
        var allEnded = true;
        for (var i; i < this.activityExecutions.length; i++) {
            allEnded &= this.activityExecutions[i].isEnded;
        }

        if (allEnded) {
            var activityType = getActivityType(this.activityDefinition);
            if (!!activityType.allActivitiesEnded) {
                activityType.allActivitiesEnded(this);
            } else {
                this.end();
            }
        }
    };

    /**
     * an activity instance is a java script object that holds the state of an
     * ActivityExecution. It can be regarded as the serialized representation
     * of an execution tree.
     */
    ActivityExecution.prototype.getActivityInstance = function () {
        var activityInstance = {
            "activityId": this.activityDefinition.id,
            "isEnded": this.isEnded,
            "startDate": this.startDate,
            "endDate": this.endDate
        };
        if (this.activityExecutions.length > 0) {
            activityInstance["activities"] = [];
            for (var i = 0; i < this.activityExecutions.length; i++) {
                activityInstance.activities.push(this.activityExecutions[i].getActivityInstance());
            }
        }
        return activityInstance;
    };


    ///////////////////////////////////////////////////////////////
    // export public APIs

    CAM.ActivityExecution = ActivityExecution;

    CAM.ExecutionException = require('./ExecutionException');
    CAM.activityTypes = activityTypes;
    CAM.getActivitiesByType = getActivitiesByType;
    CAM.getActivityById = getActivityById;
    CAM.getActivityType = getActivityType;
    CAM.getSequenceFlows = getSequenceFlows;

    CAM.LISTENER_START = LISTENER_START;
    CAM.LISTENER_END = LISTENER_END;
    CAM.LISTENER_TAKE = LISTENER_TAKE;

};