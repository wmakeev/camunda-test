/**
 * VariableScope
 */

module.exports = function () {

    function VariableScope(activityExecution) {
        activityExecution.bindVariableScope(this);
    }

    VariableScope.prototype.evaluateCondition = function(condition) {
        return eval(condition);
    };

    return VariableScope;
};