import * as uuid from "uuid";
import {DbObject} from "./DbObject";
import {dynamodb, objectDynameh} from "./dynamodb";
import log = require("loglevel");

/**
 * Limits the number of times an action can be performed by IP address.
 */
export interface DbIpAction {
    id: string;
    ip: string;
    action: DbIpAction.Action;
    ttl: Date | number;
}

export namespace DbIpAction {
    export type Action = "registration";

    const actionConfig = {
        registration: {
            maxCount: 10,
            maxAgeHours: 24
        }
    };

    export function create(action: DbIpAction.Action, ip: string): DbIpAction {
        const ttl = new Date();
        ttl.setHours(ttl.getHours() + actionConfig[action].maxAgeHours);
        return {
            id: uuid.v4(),
            ip,
            action,
            ttl: ttl
        };
    }

    export function fromDbObject(o: DbObject): DbIpAction {
        if (!o) {
            return null;
        }
        const ipAction = {...o};
        delete ipAction.pk;
        delete ipAction.sk;
        return ipAction as any;
    }

    export function toDbObject(ipAction: DbIpAction): DbIpAction & DbObject {
        if (!ipAction) {
            return null;
        }
        return {
            ...ipAction,
            ...getKeys(ipAction)
        };
    }

    export function getKeys(ipAction: DbIpAction): DbObject {
        return {
            pk: "IpAction/" + ipAction.ip + "/" + ipAction.action,
            sk: "IpAction/" + ipAction.id
        };
    }

    /**
     * Check if the given IP address can perform the given action.  Calling this
     * also take the action.
     *
     * The limit on the number of times an action can be taken is not quite precise.
     * If a user spams simultaneous requests they can get several extra actions.
     * This is good enough for most rate limiting and makes the implementation simpler.
     */
    export async function canTakeAction(action: DbIpAction.Action, ip: string): Promise<boolean> {
        const ipActions = await getAll(action, ip);
        log.info(action, "for IP", ip, "has used", ipActions.length, "/", actionConfig[action].maxCount);
        if (ipActions.length < actionConfig[action].maxCount) {
            await putOne(action, ip);
            return true;
        } else {
            log.info("action is being limited")
            return false;
        }
    }

    export async function getAll(action: DbIpAction.Action, ip: string): Promise<DbIpAction[]> {
        const req = objectDynameh.requestBuilder.buildQueryInput("IpAction/" + ip + "/" + action);
        const objects = await objectDynameh.queryHelper.queryAll(dynamodb, req);
        return objects.map(fromDbObject);
    }

    export async function putOne(action: DbIpAction.Action, ip: string): Promise<void> {
        const ipAction = create(action, ip);
        const req = objectDynameh.requestBuilder.buildPutInput(toDbObject(ipAction));
        await dynamodb.putItem(req).promise();
    }
}
