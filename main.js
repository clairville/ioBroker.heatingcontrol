/*
 * heatingcontrol adapter für iobroker
 *
 * Created: 30.07.2019 21:31:28
 *  Author: Rene

*/




/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
const utils = require('@iobroker/adapter-core');
const CronJob = require('cron').CronJob;


//========================================================================
//this must be false for production use! set it to true when you use static data for debuggung purpose only
//const bDebug = false;
//========================================================================

//structure for devices:
//    * RoomName
//    * IsActive
//    * List of Thermostats
//    * List of Actors
//    * List of Sensors


//structure for hardware (thermostats, sensors, actors):
//    * Name
//    * IsActive
//    * getValueID
//    * setValueID


// Die ThermostatTypeTab definiert die Thermostat Typen.
// used for known hardware, all others can be set manually
const ThermostatTypeTab = [];
//Homematic
ThermostatTypeTab[0] = ['HM-TC-IT-WM-W-EU', 'Wandthermostat (neu)', '.2.SET_TEMPERATURE', '.1.TEMPERATURE', '2.CONTROL_MODE'];
ThermostatTypeTab[1] = ['HM-CC-TC',             'Wandthermostat (alt)',         '.2.SETPOINT',                   '.1.TEMPERATURE',            false               ];
ThermostatTypeTab[2] = ['HM-CC-RT-DN',          'Heizkoerperthermostat(neu)',   '.4.SET_TEMPERATURE',            '.4.ACTUAL_TEMPERATURE',     '4.CONTROL_MODE'    ];
ThermostatTypeTab[3] = ['HMIP-eTRV',            'Heizkoerperthermostat(HMIP)',  '.1.SET_POINT_TEMPERATURE',      '.1.ACTUAL_TEMPERATURE',     '1.CONTROL_MODE'    ];
ThermostatTypeTab[4] = ['HMIP-WTH',             'Wandthermostat(HMIP)',         '.1.SET_POINT_TEMPERATURE',      '.1.ACTUAL_TEMPERATURE',     '1.CONTROL_MODE'    ];
ThermostatTypeTab[5] = ['HMIP-WTH-2',           'Wandthermostat(HMIP)',         '.1.SET_POINT_TEMPERATURE',      '.1.ACTUAL_TEMPERATURE',     '1.CONTROL_MODE'    ];
ThermostatTypeTab[6] = ['HMIP-STH',             'Wandthermostat(HMIP)',         '.1.SET_POINT_TEMPERATURE',      '.1.ACTUAL_TEMPERATURE',     '1.CONTROL_MODE'    ];
ThermostatTypeTab[7] = ['HMIP-STHD',            'Wandthermostat(HMIP)',         '.1.SET_POINT_TEMPERATURE',      '.1.ACTUAL_TEMPERATURE',     '1.CONTROL_MODE'    ];
ThermostatTypeTab[8] = ['HMIP-eTRV-2',          'Heizkoerperthermostat(HMIP)',  '.1.SET_POINT_TEMPERATURE',      '.1.ACTUAL_TEMPERATURE',     '1.CONTROL_MODE'    ];
ThermostatTypeTab[9] = ['HMIP-eTRV-B',          'Heizkoerperthermostat(HMIP)',  '.1.SET_POINT_TEMPERATURE',      '.1.ACTUAL_TEMPERATURE',     '1.SET_POINT_MODE'  ];
const MaxHomematicThermostatType = 9;
//MaxCube
const MinMaxcubeThermostatType = 10;
ThermostatTypeTab[10] = ['max! Thermostat', 'Thermostat', '.setpoint', '.temp', '.mode'];
/*
MAX! Heizkörperthermostat basic
MAX! Heizkörperthermostat
MAX! Heizkörperthermostat +
MAX! Wandthermostat +
*/
const MaxMaxcubeThermostatType = 10;

//tado with Homebridge accessories manager
const MinTadoThermostatType = 20;
ThermostatTypeTab[20] = ['tado Thermostat', 'Thermostat', '.Target-Temperature', '.Current-Temperature', '.mode'];
//id ist ham.0.RaumName.ThermostatName.
const MaxTadoThermostatType = 20;




const ActorTypeTab = [];
const MinHomematicActorType = 0;
ActorTypeTab[0] = ['HM-LC-Sw4-PCB', 'Funk-Schaltaktor 4-fach, Platine',             '.STATE'    ];
ActorTypeTab[1] = ['HM-LC-Sw4-DR', 'Funk-Schaltaktor 4-fach, Hutschienenmontage',   '.STATE'    ];
ActorTypeTab[2] = ['HM-LC-Sw4-SM', 'Funk-Schaltaktor 4-fach, Aufputzmontage',       '.STATE'    ];
const MaxHomematicActorType = 2;


const SensorTypeTab = [];
const MinHomematicSensorType = 0;
SensorTypeTab[0] = ['HM-Sec-SC-2', 'Funk-Tür-/Fensterkontakt', '.STATE'];
SensorTypeTab[1] = ['HM-Sec-SCo', 'Funk-Tür-/Fensterkontakt, optisch', '.STATE'];
SensorTypeTab[2] = ['HM-Sec-RHS', 'Funk-Fenster-Drehgriffkontakt', '.STATE'];
const MaxHomematicSensorType = 2;




const DefaultTargets = [];
DefaultTargets[0] = ['05:00:00', 19];
DefaultTargets[1] = ['08:00:00', 21];
DefaultTargets[2] = ['12:00:00', 21];
DefaultTargets[3] = ['16:00:00', 19];
DefaultTargets[4] = ['21:00:00', 21];

let adapter;
function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: 'heatingcontrol',
        //#######################################
        //
        ready: function () {
            try {
                //adapter.log.debug('start');
                main();
            }
            catch (e) {
                adapter.log.error('exception catch after ready [' + e + ']');
            }
        },
        //#######################################
        //  is called when adapter shuts down
        unload: function (callback) {
            try {
                adapter && adapter.log && adapter.log.info && adapter.log.info('cleaned everything up...');
                CronStop();
                callback();
            } catch (e) {
                callback();
            }


        },
        //#######################################
        //
        SIGINT: function () {
            adapter && adapter.log && adapter.log.info && adapter.log.info('cleaned everything up...');
            CronStop();
        },
        //#######################################
        //  is called if a subscribed object changes
        objectChange: function (id, obj) {
            adapter.log.debug('[OBJECT CHANGE] ==== ' + id + ' === ' + JSON.stringify(obj));
        },
        //#######################################
        // is called if a subscribed state changes
        stateChange: function (id, state) {
            //adapter.log.debug('[STATE CHANGE] ==== ' + id + ' === ' + JSON.stringify(state));
            HandleStateChange(id, state);
        },
        //#######################################
        //
        message: async (obj) => {
            if (obj) {
                switch (obj.command) {
                    case 'send':
                        // e.g. send email or pushover or whatever
                        adapter.log.debug('send command');

                        // Send response in callback if required
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                        break;
                    case 'listDevices':
                        //adapter.log.debug('got list devices');
                        await ListDevices(obj);
                        break;
                    case 'listRooms':
                        //adapter.log.debug('got list rooms');
                        await ListRooms(obj);
                        break;
                    case 'listFunctions':
                        //adapter.log.debug('got list rooms');
                        await ListFunctions(obj);
                        break;
                    case 'Test':
                        //adapter.sendTo(obj.from, obj.command, "das ist ein Test", obj.callback);
                        break;
                    default:
                        adapter.log.error('unknown message ' + obj.command);
                        break;
                }
            }
        }
    });
    adapter = new utils.Adapter(options);

    return adapter;
}
        


//#######################################
//
async function main() {
    try {
        adapter.log.debug("devices " + JSON.stringify(adapter.config.devices));
        await CreateDatepoints();
        await SubscribeStates();
        await CalculateNextTime();
        await CheckTemperatureChange();
    }
    catch (e) {
        adapter.log.error('exception in  main [' + e + ']');
    }
}

async function ListRooms(obj) {

    if (adapter.config.rooms.length === 0 || adapter.config.deleteall) {

        adapter.config.rooms.length = 0;
        var rooms = {};
        //get room enums first; this includes members as well
        const AllRoomsEnum = await adapter.getEnumAsync('rooms');
        rooms = AllRoomsEnum.result;
        adapter.log.debug("rooms " + JSON.stringify(rooms));

        for (let e in rooms) {

            adapter.config.rooms.push({
                name: rooms[e].common.name,
                isActive: false,    //must be enabled manually, otherwise we create too many datapoints for unused rooms
                WindowIsOpen: false
            });


        }
    }
    adapter.log.debug('all rooms done ' + JSON.stringify(adapter.config.devices));

    adapter.sendTo(obj.from, obj.command, adapter.config.rooms, obj.callback);
}

async function ListFunctions(obj) {

    let enumFunctions = [];
    adapter.log.debug('### start ListFunctions');
    const AllFunctionsEnum = await adapter.getEnumAsync('functions');
    adapter.log.debug("function enums: " + JSON.stringify(AllFunctionsEnum));
    let functions = AllFunctionsEnum.result;

    for (let e1 in functions) {

        enumFunctions.push({
            name: functions[e1].common.name
    });
    }
    adapter.log.debug('all functions done ' + JSON.stringify(enumFunctions));

    adapter.sendTo(obj.from, obj.command, enumFunctions, obj.callback);
}



//#######################################
//
// used as interface to admin
async function ListDevices(obj) {

    if (adapter.config.devices === null || typeof adapter.config.devices === 'undefined' || adapter.config.devices.length === 0 || adapter.config.deleteall) {

        adapter.log.info('create new device list ' + JSON.stringify(adapter.config.devices));

        if (adapter.config.devices !== null && typeof adapter.config.devices !== 'undefined' ) {
            
            adapter.config.devices.length = 0;
        }

        
        //use for test but comment it out for real life
        //AddTestData();

        let rooms = {};
        //get room enums first; this includes members as well
        const AllRoomsEnum = await adapter.getEnumAsync('rooms');
        rooms = AllRoomsEnum.result;
        

        let functions = {};
        const AllFunctionsEnum = await adapter.getEnumAsync('functions');
        adapter.log.debug("function enums: " + JSON.stringify(AllFunctionsEnum));
        functions = AllFunctionsEnum.result;
        

        let HeatingMember = [];
        for (let e1 in functions) {

            if (functions[e1].common.name === adapter.config.Gewerk ) {
                var ids1 = functions[e1].common.members;
                for (var n1 in ids1) {
                    
                    HeatingMember.push({
                        id: ids1[n1]
                    });
                }
            }
        }
        adapter.log.debug("heating member: " + JSON.stringify(HeatingMember));

        let NextID = 1;
        for (let e in rooms) {

            let ids = rooms[e].common.members;
            for (let n in ids) {

                let adapterObj;

                adapterObj = await adapter.getForeignObjectAsync(ids[n]);

                if (adapterObj && adapterObj.native) {

                    //***********************************
                    var IsInHeatingList = findObjectIdByKey(HeatingMember, 'id', adapterObj._id);

                    if (IsInHeatingList > -1) {

                        var supportedRT = -1;
                        //adapter.log.debug("check thermostat for homematic");
                        var IsInDeviceList = false;
                        for (let x1 = 0; x1 <= MaxHomematicThermostatType; x1++) {
                            //adapter.log.debug("check " + adapterObj.native.PARENT_TYPE + " === " + ThermostatTypeTab[x1][0]);
                            if (adapterObj.native.PARENT_TYPE === ThermostatTypeTab[x1][0]) {
                                supportedRT = x1;

                                adapter.log.debug("Thermostat found " + JSON.stringify(adapterObj));

                                /*
                                 * heatingcontrol.0 Thermostat found {"_id":"hm-rpc.0.JEQ0080886.1","type":"channel","common":{"name":"RT_Gaeste:1"},"native":{"ADDRESS":"JEQ0080886:1","AES_ACTIVE":0,"DIRECTION":1,"FLAGS":1,"INDEX":1,"LINK_SOURCE_ROLES":"WEATHER_TH","LINK_TARGET_ROLES":"","PARAMSETS":["LINK","MASTER","VALUES"],"PARENT":"JEQ0080886","PARENT_TYPE":"HM-CC-TC","TYPE":"WEATHER","VERSION":15},"from":"system.adapter.hm-rega.0","user":"system.user.admin","ts":1565456984587,"acl":{"object":1636,"owner":"system.user.admin","ownerGroup":"system.group.administrator"}}
                                 */

                                let sName = adapterObj.common.name.split(':')[0];

                                let oOID = adapterObj._id.split('.');
                                let sOID = oOID[0] + "." + oOID[1] + "." + oOID[2];

                                IsInDeviceList = findObjectIdByKey(adapter.config.devices, 'name', sName);
                                if (IsInDeviceList === -1) {

                                    adapter.config.devices.push({
                                        id: NextID++,
                                        name: sName,
                                        isActive: true,
                                        room: rooms[e].common.name,
                                        type: 1, //thermostats
                                        OID_Target: sOID + ThermostatTypeTab[supportedRT][2],
                                        OID_Current: sOID + ThermostatTypeTab[supportedRT][3]
                                    });
                                    

                                }
                            }
                        }

                        var supportedActor = -1;
                        //adapter.log.debug("check actor for homematic");
                        for (let x2 = MinHomematicActorType; x2 <= MaxHomematicActorType; x2++) {
                            //adapter.log.debug("check " + adapterObj.native.PARENT_TYPE + " === " + ActorTypeTab[x2][0]);
                            if (adapterObj.native.PARENT_TYPE === ActorTypeTab[x2][0]) {
                                supportedActor = x2;

                                adapter.log.debug("Actor found " + JSON.stringify(adapterObj));

                                /*
                                 * Actor found {"_id":"hm-rpc.0.LEQ0900578.3","type":"channel","common":{"name":"HK_Aktor_KG_Gast","role":"switch"},"native":{"ADDRESS":"LEQ0900578:3","AES_ACTIVE":0,"DIRECTION":2,"FLAGS":1,"INDEX":3,"LINK_SOURCE_ROLES":"","LINK_TARGET_ROLES":"SWITCH WCS_TIPTRONIC_SENSOR WEATHER_CS","PARAMSETS":["LINK","MASTER","VALUES"],"PARENT":"LEQ0900578","PARENT_TYPE":"HM-LC-Sw4-DR","TYPE":"SWITCH","VERSION":26},"from":"system.adapter.hm-rega.0","user":"system.user.admin","ts":1565456990633,"acl":{"object":1636,"owner":"system.user.admin","ownerGroup":"system.group.administrator"}}
                                 */
                                let sName = adapterObj.common.name;
                                adapter.log.debug("#111");
                                IsInDeviceList = findObjectIdByKey(adapter.config.devices, 'name', sName);
                                adapter.log.debug("#222");

                                if (IsInDeviceList === -1) {
                                    adapter.log.debug("#333 " + NextID);
                                    adapter.config.devices.push({
                                        id: NextID++,
                                        name: sName,
                                        isActive: true,
                                        room: rooms[e].common.name,
                                        type: 2, //actors
                                        OID_Target: adapterObj._id + ActorTypeTab[supportedActor][2]
                                    });
                                    adapter.log.debug("#444");
                                }
                            }
                        }

                        var supportedSensor = -1;
                        //adapter.log.debug("check sensor for homematic");
                        for (let x3 = MinHomematicSensorType; x3 <= MaxHomematicSensorType; x3++) {
                            //adapter.log.debug("check " + adapterObj.native.PARENT_TYPE + " === " + SensorTypeTab[x3][0]);
                            if (adapterObj.native.PARENT_TYPE === SensorTypeTab[x3][0]) {
                                supportedSensor = x3;

                                adapter.log.debug("Sensor found " + JSON.stringify(adapterObj));
                                let sName = adapterObj.common.name;
                                IsInDeviceList = findObjectIdByKey(adapter.config.devices, 'name', sName);
                                if (IsInDeviceList === -1) {
                                    adapter.config.devices.push({
                                        id: NextID++,
                                        name: adapterObj.common.name,
                                        isActive: true,
                                        room: rooms[e].common.name,
                                        type: 3, //sensors
                                        OID_Current: adapterObj._id + SensorTypeTab[supportedSensor][2]
                                    });
                                }


                            }
                        }

                        if (supportedSensor === -1 && supportedActor === -1 && supportedRT === -1) {
                            adapter.log.warn("device not found " + JSON.stringify(adapterObj));

                        }
                    }
                }
            }
        }
    }

    adapter.log.debug('all rooms done ' + JSON.stringify(adapter.config.devices));

    adapter.sendTo(obj.from, obj.command, adapter.config.devices, obj.callback);
}


//#######################################
//
// just for testing without real data
function AddTestData() {
    //test data
    adapter.config.devices.push({
        id: 1,
        name: "RT_WoZi",
        isActive: true,
        room: "Wohnzimmer",
        type: 1, //thermostats
        OID_Target: "hm-rpc.0.IEQ0067957.2.SETPOINT",
        OID_Current: "hm-rpc.0.IEQ0067957.1.TEMPERATURE"
    });

    adapter.config.devices.push({
        id: 2,
        name: "RT_WoZi2",
        isActive: true,
        room: "Wohnzimmer",
        type: 1, //thermostats
        OID_Target: "hm-rpc.0.IEQ0067958.2.SETPOINT",
        OID_Current: "hm-rpc.0.IEQ0067958.1.TEMPERATURE"
    });

    adapter.config.devices.push({
        id: 3,
        name: "HK_Aktor_EG_WoZi",
        isActive: true,
        room: "Wohnzimmer",
        type: 2, //heating actor
        OID_Target: "hm-rpc.0.IEQ0383091.3.STATE"
    });

    adapter.config.devices.push({
        id: 4,
        name: "Tuer1_WoZi",
        isActive: true,
        room: "Wohnzimmer",
        type: 3, //window sensor
        OID_Current: "hm-rpc.0.LEQ1509665.1.STATE"
    });

    adapter.config.devices.push({
        id: 5,
        name: "Tuer2_WoZi",
        isActive: true,
        room: "Wohnzimmer",
        type: 3, //window sensor
        OID_Current: "hm-rpc.0.LEQ1509666.1.STATE"
    });

    adapter.config.devices.push({
        id: 6,
        name: "Tuer3_WoZi",
        isActive: true,
        room: "Wohnzimmer",
        type: 3, //window sensor
        OID_Current: "hm-rpc.0.LEQ1509667.1.STATE"
    });

    adapter.config.devices.push({
        id: 7,
        name: "Fenster_WoZi",
        isActive: true,
        room: "Wohnzimmer",
        type: 3, //window sensor
        OID_Current: "hm-rpc.0.LEQ1509668.1.STATE"
    });
}





async function CreateStates4Period(id, period) {

    //adapter.log.debug('add state ' + id + '.time');
    await adapter.setObjectNotExistsAsync(id + '.time', {
        type: 'state',
        common: {
            name: 'period until',
            type: 'date',
            role: 'profile',
            unit: '',
            read: true,
            write: true
        },
        native: { id: id + '.time' }
    });

    const nextTime = await adapter.getStateAsync(id + '.time');
    //set default only if nothing was set before
    if (nextTime === null && period < DefaultTargets.length) {
        //adapter.log.debug('set default for ' +id + '.time');
        //we set a default value
        await adapter.setStateAsync(id + '.time', { ack: true, val: DefaultTargets[period][0] });
    }
    //we want to be informed when this is changed by vis or others
    adapter.subscribeStates(id + '.time');


    //adapter.log.debug('add state ' + id + '.Temperature');
    await adapter.setObjectNotExistsAsync(id + '.Temperature', {
        type: 'state',
        common: {
            name: 'target temperature',
            type: 'number',
            role: 'profile',
            unit: '°C',
            read: true,
            write: true
        },
        native: { id: id + '.Temperature' }
    });

    const nextTemp = await adapter.getStateAsync(id + '.Temperature');
    //set default only if nothing was set before
    if (nextTemp === null && period < DefaultTargets.length) {
        //adapter.log.debug('set default for ' + id + '.Temperature');
        await adapter.setStateAsync(id + '.Temperature', { ack: true, val: DefaultTargets[period][1] });
    }
    //we want to be informed when this is changed by vis or others
    adapter.subscribeStates(id + '.Temperature');
}


//#######################################
//
// create all necessary datapaoints
// will be called at ecery start of adapter
async function CreateDatepoints() {

    adapter.log.debug('CreateDatepoints');

    await adapter.setObjectNotExistsAsync('LastProgramRun', {
        type: 'state',
        common: {
            name: 'LastProgramRun',
            type: 'date',
            role: 'history',
            unit: '',
            read: true,
            write: false
        },
        native: { id: 'LastProgramRun' }
    });

    await adapter.setObjectNotExistsAsync('CurrentProfile', {
        type: 'state',
        common: {
            name: 'CurrentProfile',
            type: 'number',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'CurrentProfile' }
    });

    const currentprofile = await adapter.getStateAsync('CurrentProfile');
    //set default only if nothing was set before
    if (currentprofile === null ) {
        await adapter.setStateAsync('CurrentProfile', { ack: true, val: 1 });
    }
    adapter.subscribeStates('CurrentProfile');

    await adapter.setObjectNotExistsAsync('HeatingPeriodActive', {
        type: 'state',
        common: {
            name: 'HeatingPeriodActive',
            type: 'bool',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'HeatingPeriodActive' }
    });
    const heatingperidactive = await adapter.getStateAsync('HeatingPeriodActive');
    //set default only if nothing was set before
    if (heatingperidactive === null) {
        await adapter.setStateAsync('HeatingPeriodActive', { ack: true, val: true });
    }
        adapter.subscribeStates('HeatingPeriodActive');

    await adapter.setObjectNotExistsAsync('PublicHolidyToday', {
        type: 'state',
        common: {
            name: 'PublicHolidyToday',
            type: 'bool',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'PublicHolidyToday' }
    });
    const publicholidaytoday = await adapter.getStateAsync('PublicHolidyToday');
    //set default only if nothing was set before
    if (publicholidaytoday === null) {
        await adapter.setStateAsync('PublicHolidyToday', { ack: true, val: false });
    }
        adapter.subscribeStates('PublicHolidyToday');

    await adapter.setObjectNotExistsAsync('Present', {
        type: 'state',
        common: {
            name: 'Present',
            type: 'bool',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'Present' }
    });
    const present = await adapter.getStateAsync('Present');
    //set default only if nothing was set before
    if (present === null) {

        await adapter.setStateAsync('Present', { ack: true, val: true });
    }
    adapter.subscribeStates('Present');

    await adapter.setObjectNotExistsAsync('PartyNow', {
        type: 'state',
        common: {
            name: 'PartyNow',
            type: 'bool',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'PartyNow' }
    });
    const partynow = await adapter.getStateAsync('PartyNow');
    //set default only if nothing was set before
    if (partynow === null) {
        await adapter.setStateAsync('PartyNow', { ack: true, val: false });
    }
        adapter.subscribeStates('PartyNow');

    await adapter.setObjectNotExistsAsync('GuestsPresent', {
        type: 'state',
        common: {
            name: 'GuestsPresent',
            type: 'bool',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'GuestsPresent' }
    });
    const guestspresent = await adapter.getStateAsync('GuestsPresent');
    //set default only if nothing was set before
    if (guestspresent === null) {
        await adapter.setStateAsync('GuestsPresent', { ack: true, val: false });
    }
        adapter.subscribeStates('GuestsPresent');

    await adapter.setObjectNotExistsAsync('HolidayPresent', {
        type: 'state',
        common: {
            name: 'HolidayPresent',
            type: 'bool',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'HolidayPresent' }
    });
    const holidaypresent = await adapter.getStateAsync('HolidayPresent');
    //set default only if nothing was set before
    if (holidaypresent === null) {
        await adapter.setStateAsync('HolidayPresent', { ack: true, val: false });
    }
    adapter.subscribeStates('HolidayPresent');

    await adapter.setObjectNotExistsAsync('VacationAbsent', {
        type: 'state',
        common: {
            name: 'VacationAbsent',
            type: 'bool',
            role: 'history',
            unit: '',
            read: true,
            write: true
        },
        native: { id: 'VacationAbsent' }
    });
    const vacationabsent = await adapter.getStateAsync('VacationAbsent');
    //set default only if nothing was set before
    if (vacationabsent === null) {
        await adapter.setStateAsync('VacationAbsent', { ack: true, val: false });
    }
    adapter.subscribeStates('VacationAbsent');

    

    for (let profile = 0; profile < parseInt(adapter.config.NumberOfProfiles, 10); profile++) {
        adapter.log.debug('rooms ' + adapter.config.rooms.length);

        for (let room = 0; room < adapter.config.rooms.length; room++) {

            if (adapter.config.rooms[room].isActive) {

                let id1 = "Profiles." + profile + "." + adapter.config.rooms[room].name;

                adapter.log.debug("create data points for " + adapter.config.rooms[room].name);

                await adapter.setObjectNotExistsAsync(id1 + '.GuestIncrease', {
                    type: 'state',
                    common: {
                        name: 'GuestIncrease',
                        type: 'float',
                        role: 'history',
                        unit: '°C',
                        read: true,
                        write: true
                    },
                    native: { id: 'GuestIncrease' }
                });

                const guestincrease = await adapter.getStateAsync(id1 + '.GuestIncrease');
                //set default only if nothing was set before
                if (guestincrease === null) {
                    await adapter.setStateAsync(id1 + '.GuestIncrease', { ack: true, val: 0 });
                }
                adapter.subscribeStates(id1 + '.GuestIncrease');


                await adapter.setObjectNotExistsAsync(id1 + '.PartyDecrease', {
                    type: 'state',
                    common: {
                        name: 'PartyDecrease',
                        type: 'float',
                        role: 'history',
                        unit: '°C',
                        read: true,
                        write: true
                    },
                    native: { id: 'PartyDecrease' }
                });
                const partydecrease = await adapter.getStateAsync(id1 + '.PartyDecrease');
                //set default only if nothing was set before
                if (partydecrease === null) {
                    await adapter.setStateAsync(id1 + '.PartyDecrease', { ack: true, val: 0 });
                }
                adapter.subscribeStates(id1 + '.PartyDecrease');

                await adapter.setObjectNotExistsAsync(id1 + '.WindowOpenDecrease', {
                    type: 'state',
                    common: {
                        name: 'WindowOpenDecrease',
                        type: 'float',
                        role: 'history',
                        unit: '°C',
                        read: true,
                        write: true
                    },
                    native: { id: 'WindowOpenDecrease' }
                });
                const windowopendecrease = await adapter.getStateAsync(id1 + '.WindowOpenDecrease');
                //set default only if nothing was set before
                if (windowopendecrease === null) {
                    await adapter.setStateAsync(id1 + '.WindowOpenDecrease', { ack: true, val: 0 });
                }
                adapter.subscribeStates(id1 + '.WindowOpenDecrease');


                await adapter.setObjectNotExistsAsync(id1 + '.AbsentDecrease', {
                    type: 'state',
                    common: {
                        name: 'AbsentDecrease',
                        type: 'float',
                        role: 'history',
                        unit: '°C',
                        read: true,
                        write: true
                    },
                    native: { id: 'AbsentDecrease' }
                });
                const absentdecrease = await adapter.getStateAsync(id1 + '.AbsentDecrease');
                //set default only if nothing was set before
                if (absentdecrease === null) {
                    await adapter.setStateAsync(id1 + '.AbsentDecrease', { ack: true, val: 0 });
                }
                adapter.subscribeStates(id1 + '.AbsentDecrease');

                await adapter.setObjectNotExistsAsync(id1 + '.VacationAbsentDecrease', {
                    type: 'state',
                    common: {
                        name: 'VacationAbsentDecrease',
                        type: 'float',
                        role: 'history',
                        unit: '°C',
                        read: true,
                        write: true
                    },
                    native: { id: 'VacationAbsentDecrease' }
                });
                await adapter.setStateAsync(id1 + '.VacationAbsentDecrease', { ack: true, val: 0 });
                adapter.subscribeStates(id1 + '.VacationAbsentDecrease');

                await adapter.setObjectNotExistsAsync(id1 + '.HolidayPresentLikePublicHoliday', {
                    type: 'state',
                    common: {
                        name: 'HolidayPresentLikePublicHoliday',
                        type: 'bool',
                        role: 'history',
                        unit: '',
                        read: true,
                        write: true
                    },
                    native: { id: 'HolidayPresentLikePublicHoliday' }
                });
                const holidaypresentlikepublicholiday = await adapter.getStateAsync(id1 + '.HolidayPresentLikePublicHoliday');
                //set default only if nothing was set before
                if (holidaypresentlikepublicholiday === null) {
                    await adapter.setStateAsync(id1 + '.HolidayPresentLikePublicHoliday', { ack: true, val: true });
                }
                adapter.subscribeStates(id1 + '.HolidayPresentLikePublicHoliday');

                await adapter.setObjectNotExistsAsync(id1 + '.CurrentTimePeriod', {
                    type: 'state',
                    common: {
                        name: 'CurrentTimePeriod',
                        type: 'string',
                        role: 'history',
                        unit: '',
                        read: true,
                        write: false
                    },
                    native: { id: 'CurrentTimePeriod' }
                });
                adapter.log.debug('room ' + adapter.config.rooms[room].name + ' with ' + parseInt(adapter.config.NumberOfPeriods, 10) + " periods");


                //Profile for Monday - Sunday
                if (parseInt(adapter.config.ProfileType, 10) === 1) {
                    adapter.log.debug('Profile Type  Mo-So, profiles ' + parseInt(adapter.config.NumberOfProfiles, 10));

                    for (let period = 0; period < parseInt(adapter.config.NumberOfPeriods, 10); period++) {

                        let id = id1 + ".Mo-Su.Periods." + period;

                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);

                        CreateStates4Period(id, period);

                        
                    }
                }

                 //Profile for Monday - Friday + Sa/Su
                else if (parseInt(adapter.config.ProfileType, 10) === 2) {
                    adapter.log.debug('Profile Type  Mo-FR + Sa-So, profiles ' + parseInt(adapter.config.NumberOfProfiles, 10));

                    for (let period = 0; period < parseInt(adapter.config.NumberOfPeriods, 10); period++) {

                        let id = id1 + ".Mo-Fr.Periods." + period;

                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);
                       
                    }
                    for (let period = 0; period < parseInt(adapter.config.NumberOfPeriods, 10); period++) {

                        let id = id1 + ".Su-So.Periods." + period;

                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                    }
                }

                //Profile for every day separately
                else if (parseInt(adapter.config.ProfileType, 10) === 3) {
                    adapter.log.debug('Profile Type  every day, profiles ' + parseInt(adapter.config.NumberOfProfiles, 10));

                    for (let period = 0; period < parseInt(adapter.config.NumberOfPeriods, 10); period++) {

                        let id = id1 + ".Mon.Periods." + period;
                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                        id = id1 + ".Tue.Periods." + period;
                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                        id = id1 + ".Wed.Periods." + period;
                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                        id = id1 + ".Thu.Periods." + period;
                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                        id = id1 + ".Fri.Periods." + period;
                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                        id = id1 + ".Sat.Periods." + period;
                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                        id = id1 + ".Sun.Periods." + period;
                        adapter.log.debug('add state ' + id + " max " + DefaultTargets.length);
                        CreateStates4Period(id, period);

                    }
                     
                }
                else {
                    adapter.log.warn('not implemented yet, profile type is ' + parseInt(adapter.config.ProfileType, 10));
                }
            }
            else {
                adapter.log.debug("not active.... " + adapter.config.rooms[room].name);
            }
        }
    }
   
}

//#######################################
//
// subscribe thermostate states to be informed when target or current is changed
function SubscribeStates(callback) {

    //if we need to handle actors, then subscribe on current and target temperature
    adapter.log.debug('#start subscribtion ');

    if (adapter.config.Path2FeiertagAdapter.length > 0) {

        //feiertage.0.heute.boolean
        adapter.subscribeForeignStates(adapter.config.Path2FeiertagAdapter + ".heute.boolean");

        adapter.log.debug('subscribe ' + adapter.config.Path2FeiertagAdapter + '.heute.boolean');
    }

    if (adapter.config.devices === null || typeof adapter.config.devices === 'undefined') {
        adapter.log.warn("no devices available for subscription");
        return;
    }

    if (adapter.config.rooms === null || typeof adapter.config.rooms === 'undefined') {
        adapter.log.warn("no rooms available for subscription");
        return;
    }

    for (let i = 0; i < adapter.config.devices.length; i++) {
        //here we need to check whether room ist really active; we subscribe only for active rooms
        let room = adapter.config.devices[i].room;
        let roomdata = findObjectByKey(adapter.config.rooms, "name", room);
        //adapter.log.debug('room ' + JSON.stringify(roomdata));

        if (roomdata.isActive) {
            if (adapter.config.UseActors) {
                if (adapter.config.devices[i].type === 1 && adapter.config.devices[i].isActive) { //thermostat
                    adapter.subscribeForeignStates(adapter.config.devices[i].OID_Target);
                    adapter.subscribeForeignStates(adapter.config.devices[i].OID_Current);

                    adapter.log.debug('subscribe ' + adapter.config.devices[i].room + ' ' + adapter.config.devices[i].OID_Target + '/' + adapter.config.devices[i].OID_Current);
                }
            }

            if (adapter.config.UseSensors) {
                if (adapter.config.devices[i].type === 3 && adapter.config.devices[i].isActive) { //sensor
                    adapter.subscribeForeignStates(adapter.config.devices[i].OID_Current);

                    adapter.log.debug('subscribe ' + adapter.config.devices[i].room + ' ' + adapter.config.devices[i].OID_Current);
                }
            }
        }
    }

    adapter.log.debug('#subscribtion finished');

    if (callback) callback();
}

//*******************************************************************
//
// handles state changes of subscribed states
async function HandleStateChange(id, state) {

    adapter.log.debug("### handle state change " + id + " " + JSON.stringify(state));

    let bHandled = false;


    if (adapter.config.Path2FeiertagAdapter.length > 0) {
        if (id.includes(adapter.config.Path2FeiertagAdapter)) {
            const PublicHolday = await adapter.getStateAsync(id);

            //heatingcontrol.0.PublicHolidyToday
            await adapter.setStateAsync("PublicHolidyToday", { value: PublicHolday, ack: true });
            bHandled = true;
        }
    }

    if (state && state.ack !== true) {
        //first set ack flag
        await adapter.setStateAsync(id, { ack: true });

        if (HandleStateChangeGeneral(id, state)) {
            bHandled = true;
        }
    }
    if (!bHandled && HandleStateChangeDevices(id, state)) {
        bHandled = true;
    }
   

    if (!bHandled) {
        adapter.log.debug("### not handled " + id + " " + JSON.stringify(state));
    }
    else {
        adapter.log.debug("### all StateChange handled ");
    }
}

//*******************************************************************
//
// handles state changes of subscribed states
async function HandleStateChangeGeneral(id, state) {
    let bRet = false;

    var ids = id.split('.'); //

    if (ids[2] === "CurrentProfile") {

        if (state.val > parseInt(adapter.config.NumberOfProfiles,10)) {
            await adapter.setStateAsync(id, { ack: true, val: parseInt(adapter.config.NumberOfProfiles,10)  });
        }
        if (state.val < 1 ) {
            await adapter.setStateAsync(id, { ack: true, val: 1 });
        }
        bRet = true;
    }

    if (ids[7] === "time") {
        let values = state.val.split(':');

        let hour = 0;
        let minute = 0;
        let second = 0;

        if (values[0] && values[0] >= 0 && values[0] < 24) {
            hour = parseInt(values[0]);
            
        }
        if (values[1] && values[1] >= 0 && values[1] < 60) {
            minute = parseInt(values[1]);
            
        }
        if (values[2] && values[2] >= 0 && values[2] < 60) {
            second = parseInt(values[2]);
            
        }
        if (hour < 10) {
            hour = "0" + hour;
        }
        if (minute < 10) {
            minute = "0" + minute;
        }
        if (second < 10) {
            second = "0" + second;
        }
        let sTime = hour + ":" + minute + ":" + second;

        await adapter.setStateAsync(id, { ack: true, val: sTime });
        bRet = true;
    }

    if (ids[2] === "GuestsPresent") {
        //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[2] === "HeatingPeriodActive") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[2] === "HolidayPresent") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[2] === "PartyNow") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[2] === "Present") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[2] === "PublicHolidyToday") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[2] === "VacationAbsent") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }

    
    if (ids[5] === "AbsentDecrease") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[5] === "GuestIncrease") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[5] === "HolidayPresentLikePublicHoliday") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[5] === "PartyDecrease") {
         //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[5] === "WindowOpenDecrease") {
        //ßßß
        CheckTemperatureChange();
        bRet = true;
    }
    if (ids[5] === "VacationAbsentDecrease") {
        //ßßß
        CheckTemperatureChange();
        bRet = true;
    }


    if (ids[7] === "time" || ids[2] ==="CurrentProfile") {
        await CalculateNextTime();
        bRet = true;
    }

    if (ids[7] === "temperature") {
        bRet = true;
    }

    return bRet;
}

//*******************************************************************
//
// handles state changes of subscribed states
// * find the room
// * check if with actor handling; if so then check if target is different to current
async function HandleStateChangeDevices(id, state) {

    let bRet = false;

    adapter.log.warn('handle actors ' + id + JSON.stringify(state)); 

    let device = findObjectByKey(adapter.config.devices, 'OID_Target', id);
    let devicetype = - 1;

    if (device !== null) {
        devicetype = 1; //it was OID_Target
    }
    else {
        device = findObjectByKey(adapter.config.devices, 'OID_Current', id);
    }

    if (device !== null) {

        if (devicetype === -1) devicetype = 2; //it was OID_Current

        if (device.type === 1) {//thermostat
            const HeatingPeriodActive = await adapter.getStateAsync("HeatingPeriodActive");

            if (HeatingPeriodActive) {
                if (devicetype === 1) { //it was target of thermostat
                    bRet = true;

                    const current = await adapter.getForeignStateAsync(device.OID_Current);
                    await HandleActors(device.ID, parseFloat(current.val), parseFloat(state.val));
                }
                else {

                    if (devicetype === 2) { //it was current of thermostat
                        bRet = true;

                        const target = await adapter.getForeignStateAsync(device.OID_Target);
                        await HandleActors(device.ID, parseFloat(state.val), parseFloat(target.val));
                    }
                }
            }
            else {
                adapter.log.warn('handling actors out of heating period not implemented yet'); 
            }
        }
        else if (device.type === 2) {//actor
            //nothing to do
        }
        else if (device.type === 3) {//sensor

            const state = await adapter.getForeignStateAsync(device.OID_Current);

            let roomID = findObjectIdByKey(adapter.config.rooms, 'name', device.room);

            adapter.log.debug('set ' + adapter.config.rooms[roomID].name + " window open to " + JSON.stringify(state)); 

            adapter.config.rooms[roomID].WindowIsOpen = state.val;
            CheckTemperatureChange();

        } 
    }
    else {
        adapter.log.warn('device not found ' + id );
    }

    return bRet;

}

//*******************************************************************
//
//handles actors based on current and target temperature
//to do: better control; right now it's just on / off without hystheresis or similar
async function HandleActors(deviceID, current, target) {

    let room = adapter.config.devices[deviceID].room;

    adapter.log.debug('handle actors ' + room + " current " + current + " target " + target);

    //Temperatur größer als Zieltemp: dann Aktor aus; sonst an
    if (current > target) {
        //find all actors for that room and set them
        for (let i = 0; i < adapter.config.devices.length; i++) {

            if (adapter.config.devices[i].room === room && adapter.config.devices[i].type === 2) {

                await adapter.setForeignStateAsync(adapter.config.devices[i].OID_Target, false);
                adapter.log.debug('room ' + room + " actor " + adapter.config.devices[i].OID_Target + " off");
            }
        }

    }
    else if (current < target) {

        //find all actors for that room and set them
        for (let i = 0; i < adapter.config.devices.length; i++) {

            if (adapter.config.devices[i].room === room && adapter.config.devices[i].type === 2) {

                await adapter.setForeignStateAsync(adapter.config.devices[i].OID_Target, true);
                adapter.log.debug('room ' + room + " actor " + adapter.config.devices[i].OID_Target + " on");
            }
        }
    }
}





//*******************************************************************
//
// find a object in array by key and value
// returns the object
function findObjectByKey(array, key, value) {
    if (array !== null && typeof array !== 'undefined') {
        for (let i = 0; i < array.length; i++) {
            if (array[i][key] === value) {
                return array[i];
            }
        }
    }
    return null;
}

//*******************************************************************
//
// find a object in array by key and value
// returns index number
function findObjectIdByKey(array, key, value) {

    if (array !== null && typeof array !== 'undefined') {

        for (let i = 0; i < array.length; i++) {
            if (array[i][key] === value) {
                return i;
            }
        }
    }
    return -1;
}







//#######################################
// cron fucntions
function CronStop() {
    if (cronJobs.length > 0) {
        adapter.log.debug("delete " + cronJobs.length + " cron jobs");
        //cancel all cron jobs...
        var start = cronJobs.length - 1;
        for (let n = start; n >= 0; n--) {
            //adapter.log.debug("stop cron job " + n);
            cronJobs[n].stop();
        }
        cronJobs=[];
    }
}




let cronJobs = [];

function CronCreate(Hour, Minute, day) {
    const timezone = adapter.config.timezone || 'Europe/Berlin';

    //https://crontab-generator.org/
    let cronString = '0 ' + Minute + ' ' + Hour + ' * * ';

    if (day === 0) { //every day
        cronString += '*';
    }
    else if (day === -1) {//Mo-Fr
        cronString += ' 1-5';
    }
    else if (day === -2) {//Sa-So
        cronString += ' 6-7';
    }
    else if (day > 0 && day < 8) {
        cronString += day;
    }
    const nextCron = cronJobs.length;

    adapter.log.debug("create cron job #" + nextCron + " at " + Hour + ":" + Minute + " string: " + cronString + " " + timezone);

    //details see https://www.npmjs.com/package/cron
    cronJobs[nextCron] = new CronJob(cronString,
        () => CheckTemperatureChange(),
        () => adapter.log.debug('cron job stopped'), // This function is executed when the job stops
        true,
        timezone
    );

    
}

function getCronStat() {

    adapter.log.debug("cron jobs");
    for (let n = 0; n < cronJobs.length; n++) {

        adapter.log.debug('[INFO] ' + '      status = ' + cronJobs[n].running + ' next event: ' + timeConverter(cronJobs[n].nextDates()));

    }
}

function timeConverter(time) {

    const a = new Date(time);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = a.getFullYear();
    const month = months[a.getMonth()];
    let date = a.getDate();
    date = date < 10 ? ' ' + date : date;
    let hour = a.getHours();
    hour = hour < 10 ? '0' + hour : hour;
    let min = a.getMinutes();
    min = min < 10 ? '0' + min : min;
    let sec = a.getSeconds();
    sec = sec < 10 ? '0' + sec : sec;

    var sRet = "";
    //if (timeonly) {
    //    sRet = hour + ':' + min + ':' + sec;
    //}
    //else {
        sRet = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec
    //}

    return sRet;
}


//#######################################
//
// we fill a list with all time stamps and start cron jobs
// this must be calles when
//  * adapter starts
//  * everytime a time value is changed
//  
async function CalculateNextTime() {

    try {
        adapter.log.debug("start CalculateNextTime, profile type " + parseInt(adapter.config.ProfileType, 10));

        CronStop();

        let timerList = [];

        let currentProfile = await GetCurrentProfile();

        if (parseInt(adapter.config.ProfileType, 10) === 1) {

            for (var room = 0; room < adapter.config.rooms.length; room++) {

                if (adapter.config.rooms[room].isActive) {

                    for (var period = 0; period < adapter.config.NumberOfPeriods; period++) {
                        const id = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + ".Mo-Su.Periods." + period + '.time';

                        //adapter.log.debug("check time for " + adapter.config.rooms[room].name + " " + id);

                        const nextTime = await adapter.getStateAsync(id);
                        adapter.log.debug("---found time for " + adapter.config.rooms[room].name + " at " + JSON.stringify(nextTime) + " " + nextTime.val);

                        let nextTimes = nextTime.val.split(':'); //here we get hour and minute

                        //add to list if not already there
                        let bFound = false;
                        for (var i = 0; i < timerList.length; i++) {
                            if (timerList[i].hour === parseInt(nextTimes[0]) && timerList[i].minute === parseInt(nextTimes[1])) {
                                bFound = true;
                                //adapter.log.debug("already in list " + JSON.stringify(nextTime));
                            }
                        }
                        if (!bFound) {
                            adapter.log.debug("push to list " + " = " + nextTimes);
                            timerList.push({
                                hour: parseInt(nextTimes[0]),
                                minute: parseInt(nextTimes[1]),
                                day: 0
                            });
                        }
                    }
                }
            }



        }
        else if (parseInt(adapter.config.ProfileType, 10) === 2) {

              for (var room = 0; room < adapter.config.rooms.length; room++) {

                if (adapter.config.rooms[room].isActive) {

                    for (var period = 0; period < adapter.config.NumberOfPeriods; period++) {
                        const id = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + ".Mo-Fr.Periods." + period + '.time';

                        //adapter.log.debug("check time for " + adapter.config.rooms[room].name + " " + id);

                        const nextTime = await adapter.getStateAsync(id);
                        adapter.log.debug("---1 found time for " + adapter.config.rooms[room].name + " at " + JSON.stringify(nextTime) + " " + nextTime.val);

                        let nextTimes = nextTime.val.split(':'); //here we get hour and minute

                        //add to list if not already there
                        let bFound = false;
                        for (var i = 0; i < timerList.length; i++) {
                            if (timerList[i].hour === parseInt(nextTimes[0]) && timerList[i].minute === parseInt(nextTimes[1]) && timerList[i].day === -1) {
                                bFound = true;
                                //adapter.log.debug("already in list " + JSON.stringify(nextTime));
                            }
                        }
                        if (!bFound) {
                            adapter.log.debug("push to list " + " = " + nextTimes);
                            timerList.push({
                                hour: parseInt(nextTimes[0]),
                                minute: parseInt(nextTimes[1]),
                                day: -1
                            });
                        }
                    }

                    for (var period = 0; period < adapter.config.NumberOfPeriods; period++) {
                        const id = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + ".Su-So.Periods." + period + '.time';

                        //adapter.log.debug("check time for " + adapter.config.rooms[room].name + " " + id);

                        const nextTime = await adapter.getStateAsync(id);
                        adapter.log.debug("---2 found time for " + adapter.config.rooms[room].name + " at " + JSON.stringify(nextTime) + " " + nextTime.val);

                        let nextTimes = nextTime.val.split(':'); //here we get hour and minute

                        //add to list if not already there
                        let bFound = false;
                        for (var i = 0; i < timerList.length; i++) {
                            if (timerList[i].hour === parseInt(nextTimes[0]) && timerList[i].minute === parseInt(nextTimes[1]) && timerList[i].day === -2) {
                                bFound = true;
                                //adapter.log.debug("already in list " + JSON.stringify(nextTime));
                            }
                        }
                        if (!bFound) {
                            adapter.log.debug("push to list " + " = " + nextTimes);
                            timerList.push({
                                hour: parseInt(nextTimes[0]),
                                minute: parseInt(nextTimes[1]),
                                day: -2
                            });
                        }
                    }
                }
            }
        }
        else if (parseInt(adapter.config.ProfileType, 10) === 3) {
            for (var room = 0; room < adapter.config.rooms.length; room++) {
                var sday;
                if (adapter.config.rooms[room].isActive) {

                    for (var day = 1; day <= 7; day++)

                        switch (day) {
                            case 1: sday = "Mon"; break;
                            case 2: sday = "Tue"; break;
                            case 3: sday = "Wed"; break;
                            case 4: sday = "Thu"; break;
                            case 5: sday = "Fri"; break;
                            case 6: sday = "Sat"; break;
                            case 7: sday = "Sun"; break;
                        }

                    for (var period = 0; period < adapter.config.NumberOfPeriods; period++) {
                        const id = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + "." + sday + ".Periods." + period + '.time';

                        //adapter.log.debug("check time for " + adapter.config.rooms[room].name + " " + id);

                        const nextTime = await adapter.getStateAsync(id);
                        adapter.log.debug("---found time for " + adapter.config.rooms[room].name + " at " + JSON.stringify(nextTime) + " " + nextTime.val);

                        let nextTimes = nextTime.val.split(':'); //here we get hour and minute

                        //add to list if not already there
                        let bFound = false;
                        for (var i = 0; i < timerList.length; i++) {
                            if (timerList[i].hour === parseInt(nextTimes[0]) && timerList[i].minute === parseInt(nextTimes[1]) && timerList[i].day === day) {
                                bFound = true;
                                //adapter.log.debug("already in list " + JSON.stringify(nextTime));
                            }
                        }
                        if (!bFound) {
                            adapter.log.debug("push to list " + " = " + nextTimes);
                            timerList.push({
                                hour: parseInt(nextTimes[0]),
                                minute: parseInt(nextTimes[1]),
                                day: day
                            });
                        }
                    }
                }
            }
        }
        else {
            adapter.log.warn('CalculateNextTime: not implemented yet, profile type is ' + adapter.config.ProfileType);
        }

        //and now start all cron jobs
        for (var m = 0; m < timerList.length; m++) {
            CronCreate(timerList[m].hour, timerList[m].minute, timerList[m].day);
        }

        getCronStat();
    }
    catch (e) {
        adapter.log.error('exception in CalculateNextTime[' + e + ']');
    }
}

async function GetCurrentProfile() {

    adapter.log.debug('get profile');

    const id = 'CurrentProfile';
    let currentProfile = await adapter.getStateAsync(id);
    if (currentProfile > 0 && currentProfile <= parseInt(adapter.config.NumberOfProfiles,10)) {
        currentProfile--; //zero based!!
    }
    else {
        currentProfile = 0;
    }
    adapter.log.debug('profile ' + currentProfile);
    return currentProfile;
}


//#######################################
//
// this is called by cron
// so we need to find out what needs to be changed and change it
//normally it's a temperature target value
async function CheckTemperatureChange() {

    if (adapter.config.devices === null || typeof adapter.config.devices === 'undefined') {
        adapter.log.warn("no devices available for checkTempChange");
        return;
    }


    try {
        adapter.log.debug('CheckTemperatureChange is called');

        const now = new Date();
        adapter.setStateAsync('LastProgramRun', { ack: true, val: now.toLocaleString() });

        
       


        //first we need some information
        const HeatingPeriodActive = await adapter.getStateAsync("HeatingPeriodActive");

        if (HeatingPeriodActive) {

            const GuestsPresent = await adapter.getStateAsync("GuestsPresent");

            const HolidayPresent = await adapter.getStateAsync("HolidayPresent");
            const PartyNow = await adapter.getStateAsync("PartyNow");
            const Present = await adapter.getStateAsync("Present");
            let PublicHolidyToday = false;

            if (adapter.config.PublicHolidayLikeSunday === true) {

                PublicHolidyToday = await adapter.getStateAsync("PublicHolidyToday");

            }


            const VacationAbsent = await adapter.getStateAsync("VacationAbsent");

            adapter.log.debug("profile type " + adapter.config.ProfileType);

            const currentProfile = await GetCurrentProfile();
            for (var room = 0; room < adapter.config.rooms.length; room++) {
                if (adapter.config.rooms[room].isActive) {
                    adapter.log.debug("check room " + adapter.config.rooms[room].name);

                    //and we need some information per room
                    let idPreset = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + "."; 
                    let AbsentDecrease = 0;
                    if (!Present) {
                        let temp1 = await adapter.getStateAsync(idPreset + "AbsentDecrease");

                        adapter.log.debug("AbsentDecrease " + JSON.stringify(temp1));
                        if (temp1 !== null) {
                            AbsentDecrease = temp1.val;
                        }
                        else {
                            adapter.log.warn("AbsentDecrease not defined");
                        }
                    }
                    let GuestIncrease = 0;
                    if (GuestsPresent) {
                        let temp2 = await adapter.getStateAsync(idPreset + "GuestIncrease");
                        adapter.log.debug("GuestIncrease " + JSON.stringify(temp2));
                        if (temp2 !== null) {
                            GuestIncrease = temp2.val;
                        }
                        else {
                            adapter.log.warn("GuestIncrease not defined");
                        }
                    }
                    let PartyDecrease = 0;
                    if (PartyNow) {
                        let temp3 = await adapter.getStateAsync(idPreset + "PartyDecrease");
                        adapter.log.debug("PartyDecrease " + JSON.stringify(temp3));
                        if (temp3 !== null) {
                            PartyDecrease = temp3.val;
                        }
                        else {
                            adapter.log.warn("PartyDecrease not defined");
                        }
                    }
                    let WindowOpen = adapter.config.rooms[room].WindowIsOpen;
                    let WindowOpenDecrease = 0;
                    if (WindowOpen) {
                        let temp4 = await adapter.getStateAsync(idPreset + "WindowOpenDecrease");
                        adapter.log.debug("WindowOpenDecrease " + JSON.stringify(temp4));
                        if (temp4 !== null) {
                            WindowOpenDecrease = temp4.val;
                        }
                        else {
                            adapter.log.warn("WindowOpenDecrease not defined");
                        }
                    }
                    let VacationAbsentDecrease = 0;
                    if (VacationAbsent) {
                        let temp5 = await adapter.getStateAsync(idPreset + "VacationAbsentDecrease");
                        adapter.log.debug("VacationAbsentDecrease " + JSON.stringify(temp5));
                        if (temp5 !== null) {
                            VacationAbsentDecrease = temp5.val;
                        }
                        else {
                            adapter.log.warn("VacationAbsentDecrease not defined");
                        }
                    }

                    const HolidayPresentLikePublicHoliday = await adapter.getStateAsync("HolidayPresentLikePublicHoliday");

                    let currentPeriod = -1;
                    let nextTemperature = -99;
                    let sNextTime;

                    adapter.log.debug("number of periods  " + adapter.config.NumberOfPeriods);

                    if (parseInt(adapter.config.ProfileType, 10) === 1) {



                        for (var period = 0; period < parseInt(adapter.config.NumberOfPeriods, 10); period++) {
                            const id = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + ".Mo-Su.Periods." + period + '.time';
                            adapter.log.debug("check ID " + id);

                            const nextTime = await adapter.getStateAsync(id);
                            //adapter.log.debug("##found time for " + adapter.config.rooms[room].name + " at " + JSON.stringify(nextTime) + " " + nextTime.val);

                            let nextTimes = nextTime.val.split(':'); //here we get hour and minute

                            //adapter.log.debug("# " + JSON.stringify(nextTimes) + " " + now.getHours() + " " + now.getMinutes());

                            //hier Zeitraum prüfen, dann kann das ganze auch bei Änderung aufgerufen werden

                            if (now.getHours() > parseInt(nextTimes[0])
                                || (now.getHours() === parseInt(nextTimes[0]) && now.getMinutes() >= parseInt(nextTimes[1]))) {

                                const id2 = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + ".Mo-Su.Periods." + period + '.Temperature';

                                let temp6 = await adapter.getStateAsync(id2);
                                nextTemperature = temp6.val;

                                adapter.log.debug("check time for " + adapter.config.rooms[room].name + " " + id + " " + nextTemperature);
                                currentPeriod = period;
                                sNextTime = nextTimes;

                            }

                        }
                    }
                    else if (parseInt(adapter.config.ProfileType, 10) === 2) {

                        let daysname = "";
                        if (now.getDay() > 0 && now.getDay() < 6) {
                            daysname = "Mo-Fr";
                        }
                        else {
                            daysname = "Su-So";
                        }

                        if (PublicHolidyToday && adapter.config.PublicHolidayLikeSunday) {
                            daysname = "Su-So";
                        }


                        for (var period = 0; period < parseInt(adapter.config.NumberOfPeriods, 10); period++) {
                            const id = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + "." + daysname + ".Periods." + period + '.time';
                            adapter.log.debug("check ID " + id);

                            const nextTime = await adapter.getStateAsync(id);
                            //adapter.log.debug("##found time for " + adapter.config.rooms[room].name + " at " + JSON.stringify(nextTime) + " " + nextTime.val);

                            let nextTimes = nextTime.val.split(':'); //here we get hour and minute

                            //adapter.log.debug("# " + JSON.stringify(nextTimes) + " " + now.getHours() + " " + now.getMinutes());

                            //hier Zeitraum prüfen, dann kann das ganze auch bei Änderung aufgerufen werden

                            if (now.getHours() > parseInt(nextTimes[0])
                                || (now.getHours() === parseInt(nextTimes[0]) && now.getMinutes() >= parseInt(nextTimes[1]))) {

                                const id2 = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + "." + daysname + ".Periods." + period + '.Temperature';

                                let temp6 = await adapter.getStateAsync(id2);
                                nextTemperature = temp6.val;

                                adapter.log.debug("check time for " + adapter.config.rooms[room].name + " " + id + " " + nextTemperature);
                                currentPeriod = period;
                                sNextTime = nextTimes;

                            }

                        }
                    }
                    else if (parseInt(adapter.config.ProfileType, 10) === 3) {

                        let daysname = "";
                        switch (now.getDay()) {
                            case 1: daysname = "Mon"; break;
                            case 2: daysname = "Tue"; break;
                            case 3: daysname = "Wed"; break;
                            case 4: daysname = "Thu"; break;
                            case 5: daysname = "Fri"; break;
                            case 6: daysname = "Sat"; break;
                            case 0: daysname = "Sun"; break;
                        }

                        if (PublicHolidyToday && adapter.config.PublicHolidayLikeSunday) {
                            daysname = "Sun";
                        }


                        for (var period = 0; period < parseInt(adapter.config.NumberOfPeriods, 10); period++) {

                            const id = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + "." + daysname + ".Periods." + period + '.time';

                            adapter.log.debug("check ID " + id);

                            const nextTime = await adapter.getStateAsync(id);
                            //adapter.log.debug("##found time for " + adapter.config.rooms[room].name + " at " + JSON.stringify(nextTime) + " " + nextTime.val);

                            let nextTimes = nextTime.val.split(':'); //here we get hour and minute

                            //adapter.log.debug("# " + JSON.stringify(nextTimes) + " " + now.getHours() + " " + now.getMinutes());

                            //hier Zeitraum prüfen, dann kann das ganze auch bei Änderung aufgerufen werden

                            if (now.getHours() > parseInt(nextTimes[0])
                                || (now.getHours() === parseInt(nextTimes[0]) && now.getMinutes() >= parseInt(nextTimes[1]))) {

                                const id2 = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + "." + daysname + ".Periods." + period + '.Temperature';

                                let temp6 = await adapter.getStateAsync(id2);
                                nextTemperature = temp6.val;

                                adapter.log.debug("check time for " + adapter.config.rooms[room].name + " " + id + " " + nextTemperature);
                                currentPeriod = period;
                                sNextTime = nextTimes;
                            }
                        }
                    }
                    else {
                        //adapter.log.warn("profile type != 1 not implemented yet");
                        adapter.log.warn('CheckTemperatureChange:not implemented yet, profile type is ' + parseInt(adapter.config.ProfileType, 10));
                    }

                    if (currentPeriod > -1) {
                        //find devices for rooms
                        let nextSetTemperature = nextTemperature - AbsentDecrease + GuestIncrease - PartyDecrease - VacationAbsentDecrease - WindowOpenDecrease;

                        adapter.log.debug("### " + nextTemperature + " " + AbsentDecrease + " " + GuestIncrease + " " + PartyDecrease + " " + VacationAbsentDecrease + " " + WindowOpenDecrease);

                        for (let ii = 0; ii < adapter.config.devices.length; ii++) {

                            if (adapter.config.devices[ii].type === 1 && adapter.config.devices[ii].room === adapter.config.rooms[room].name && adapter.config.devices[ii].isActive) {

                                adapter.log.info('room ' + adapter.config.rooms[room].name + " Thermostate " + adapter.config.devices[ii].name + " set to " + nextSetTemperature);

                                //adapter.log.debug("*4 " + state);
                                await adapter.setForeignStateAsync(adapter.config.devices[ii].OID_Target, nextSetTemperature);
                            }
                        }
                        const timePeriod = "Period " + currentPeriod + " : " + sNextTime[0] + ":" + sNextTime[1];
                        const id3 = "Profiles." + currentProfile + "." + adapter.config.rooms[room].name + ".CurrentTimePeriod";
                        await adapter.setStateAsync(id3, { ack: true, val: timePeriod });
                    }



                }
            }
        }
        else {
            adapter.log.debug("nothing to do: no heating period");
        }

        await HandleActorsGeneral(HeatingPeriodActive);

        getCronStat();
    }
    catch (e) {
        adapter.log.error('exception in CheckTemperatureChange[' + e + ']');
    }
}


async function HandleActorsGeneral(HeatingPeriodActive) {
    if (adapter.config.UseActors) {

        var room;
        //if no heating period and acturs should be set to on or off
        if (!HeatingPeriodActive && adapter.config.UseActorsIfNotHeating > 1) {
            let target = adapter.config.UseActorsIfNotHeating === 2 ? false : true;
            for (let device = 0; device < adapter.config.devices.length; device++) {
                if (adapter.config.devices[device].type === 2) {

                    await adapter.setForeignStateAsync(adapter.config.devices[device].OID_Target, target);
                    adapter.log.debug('room ' + adapter.config.devices[target].room + " actor " + adapter.config.devices[device].OID_Target + " " + state);
                }
            }
        }


        //if we are in heating period but room has no thermostat
        if (HeatingPeriodActive && adapter.config.UseActorsIfNoThermostat > 1) {

            //let target = adapter.config.UseActorsIfNoThermostat === 2 ? false : true;

            adapter.log.warn("HandleActorsGeneral: not implemented yet");
        }
    }
}


// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} 



