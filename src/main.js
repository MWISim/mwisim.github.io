import Equipment from "./combatsimulator/equipment.js";
import Player from "./combatsimulator/player.js";
import abilityDetailMap from "./combatsimulator/data/abilityDetailMap.json";
import itemDetailMap from "./combatsimulator/data/itemDetailMap.json";
import houseRoomDetailMap from "./combatsimulator/data/houseRoomDetailMap.json";
import Ability from "./combatsimulator/ability.js";
import Consumable from "./combatsimulator/consumable.js";
import HouseRoom from "./combatsimulator/houseRoom"
import combatTriggerDependencyDetailMap from "./combatsimulator/data/combatTriggerDependencyDetailMap.json";
import combatTriggerConditionDetailMap from "./combatsimulator/data/combatTriggerConditionDetailMap.json";
import combatTriggerComparatorDetailMap from "./combatsimulator/data/combatTriggerComparatorDetailMap.json";
import abilitySlotsLevelRequirementList from "./combatsimulator/data/abilitySlotsLevelRequirementList.json";
import actionDetailMap from "./combatsimulator/data/actionDetailMap.json";
import combatMonsterDetailMap from "./combatsimulator/data/combatMonsterDetailMap.json";
import damageTypeDetailMap from "./combatsimulator/data/damageTypeDetailMap.json";
import combatStyleDetailMap from "./combatsimulator/data/combatStyleDetailMap.json"

const ONE_SECOND = 1e9;
const ONE_HOUR = 60 * 60 * ONE_SECOND;
const ALL_ZONES_SIM_TIME = 3

let buttonStartSimulation = document.getElementById("buttonStartSimulation");
let buttonStartAllZonesSimulation = document.getElementById("buttonStartAllSimulations");
let progressbar = document.getElementById("simulationProgressBar");
let allZonesProgressbar = document.getElementById("allZonesSimulationProgressBar");

let worker = new Worker(new URL("worker.js", import.meta.url));

let player = new Player();
let food = [null, null, null];
let drinks = [null, null, null];
let abilities = [null, null, null, null];
let triggerMap = {};
let modalTriggers = [];
let allZonesSimulationResults = {};
let allZonesSimulationProgress = {};

// TOOD dungeon wave spawns
let gameZones = Object.values(actionDetailMap)
.filter((action) => action.type == "/action_types/combat" && action.category != "/action_categories/combat/dungeons")
.sort((a, b) => a.sortIndex - b.sortIndex)

for (const zone of gameZones) {
    allZonesSimulationProgress[zone.hrid] = 0;
}

window.revenue = 0;
window.noRngRevenue = 0;
window.expenses = 0;
window.profit = 0;
window.noRngProfit = 0;

// #region Worker

worker.onmessage = function (event) {
    switch (event.data.type) {
        case "simulation_result":
            progressbar.style.width = "100%";
            progressbar.innerHTML = "100%";
            showSimulationResult(event.data.simResult);
            buttonStartSimulation.disabled = false;
            break;
        case "simulation_progress":
            let progress = Math.floor(100 * event.data.progress);
            progressbar.style.width = progress + "%";
            progressbar.innerHTML = progress + "%";
            break;
        case "simulation_error":
            showErrorModal(event.data.error.toString());
            break;
    }
};

// #endregion

// #region Equipment

function initEquipmentSection() {
    ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "pouch", "neck", "earrings", "ring", "back"].forEach((type) => {
        initEquipmentSelect(type);
        initEnhancementLevelInput(type);
    });
}

function initEquipmentSelect(equipmentType) {
    let selectId = "selectEquipment_";
    if (equipmentType == "main_hand" || equipmentType == "two_hand") {
        selectId += "weapon";
    } else {
        selectId += equipmentType;
    }
    let selectElement = document.getElementById(selectId);

    let gameEquipment = Object.values(itemDetailMap)
        .filter((item) => item.categoryHrid == "/item_categories/equipment")
        .filter((item) => item.equipmentDetail.type == "/equipment_types/" + equipmentType)
        .sort((a, b) => a.sortIndex - b.sortIndex);

    for (const equipment of Object.values(gameEquipment)) {
        selectElement.add(new Option(equipment.name, equipment.hrid));
    }

    selectElement.addEventListener("change", (event) => {
        equipmentSelectHandler(event, equipmentType);
    });
}

function initHouseRoomsModal() {
    let houseRoomsList = document.getElementById("houseRoomsList");
    let newChildren = [];
    let houseRooms = Object.values(houseRoomDetailMap).sort((a, b) => a.sortIndex - b.sortIndex);
    player.houseRooms = {};

    for (const room of Object.values(houseRooms)) {
        player.houseRooms[room.hrid] = 0;

        let row = createElement("div", "row mb-2");

        let nameCol = createElement("div", "col-md-4 offset-md-3 align-self-center", room.name);
        row.appendChild(nameCol);

        let levelCol = createElement("div", "col-md-2");
        let levelInput = createHouseInput(room.hrid);

        levelInput.addEventListener("input", function (e) {
            let inputValue = e.target.value;
            const hrid = e.target.dataset.houseHrid;
            player.houseRooms[hrid] = parseInt(inputValue);
        });

        levelCol.appendChild(levelInput);
        row.appendChild(levelCol);

        newChildren.push(row);
    }

    houseRoomsList.replaceChildren(...newChildren);
}

function createHouseInput(hrid) {
    let levelInput = document.createElement("input");
    levelInput.className = "form-control";
    levelInput.type = "number";
    levelInput.placeholder = 0;
    levelInput.min = 0;
    levelInput.max = 8;
    levelInput.step = 1;
    levelInput.dataset.houseHrid = hrid;

    return levelInput;
}

function initEnhancementLevelInput(equipmentType) {
    let inputId = "inputEquipmentEnhancementLevel_";
    if (equipmentType == "main_hand" || equipmentType == "two_hand") {
        inputId += "weapon";
    } else {
        inputId += equipmentType;
    }

    let inputElement = document.getElementById(inputId);
    inputElement.value = 0;
    inputElement.addEventListener("change", enhancementLevelInputHandler);
}

function equipmentSelectHandler(event, type) {
    let equipmentType = "/equipment_types/" + type;

    if (!event.target.value) {
        updateEquipmentState();
        updateUI();
        return;
    }

    let gameItem = itemDetailMap[event.target.value];

    // Weapon select has two handlers because of mainhand and twohand weapons. Ignore the handler with the wrong type
    if (gameItem.equipmentDetail.type != equipmentType) {
        return;
    }

    if (type == "two_hand") {
        document.getElementById("selectEquipment_off_hand").value = "";
        document.getElementById("inputEquipmentEnhancementLevel_off_hand").value = 0;
    }
    if (type == "off_hand" && player.equipment["/equipment_types/two_hand"]) {
        document.getElementById("selectEquipment_weapon").value = "";
        document.getElementById("inputEquipmentEnhancementLevel_weapon").value = 0;
    }

    updateEquipmentState();
    updateUI();
}

function enhancementLevelInputHandler() {
    updateEquipmentState();
    updateUI();
}

function updateEquipmentState() {
    ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "pouch", "neck", "earrings", "ring", "back"].forEach((type) => {
        let equipmentType = "/equipment_types/" + type;
        let selectType = type;
        if (type == "main_hand" || type == "two_hand") {
            selectType = "weapon";
        }

        let equipmentSelect = document.getElementById("selectEquipment_" + selectType);
        let equipmentHrid = equipmentSelect.value;

        if (!equipmentHrid) {
            player.equipment[equipmentType] = null;
            return;
        }

        let gameItem = itemDetailMap[equipmentHrid];

        // Clear old weapon if a weapon of a different type is equipped
        if (gameItem.equipmentDetail.type != equipmentType) {
            player.equipment[equipmentType] = null;
            return;
        }

        let enhancementLevel = Number(document.getElementById("inputEquipmentEnhancementLevel_" + selectType).value);
        player.equipment[equipmentType] = new Equipment(gameItem.hrid, enhancementLevel);
    });
}

document.getElementById("selectEquipment_set").onchange = changeEquipmentSetListener;

function changeEquipmentSetListener() {
    let value = this.value
    let optgroupType = this.options[this.selectedIndex].parentNode.label;

    ["head", "body", "legs", "feet", "hands"].forEach((type) => {
        let selectType = type;

        let currentEquipment = document.getElementById("selectEquipment_" + selectType);
        if (type === "feet") {
            type = "_boots";
        }
        if (type === "hands") {
            if (optgroupType === "RANGED") {
                type = "_bracers";
            } else if (optgroupType === "MAGIC") {
                type = "_gloves";
            } else {
                type = "_gauntlets";
            }
        }
        if (type === "head") {
            if (optgroupType === "RANGED") {
                type = "_hood";
            } else if (optgroupType === "MAGIC") {
                type = "_hat";
            } else {
                type = "_helmet";
            }
        }
        if (type === "legs") {
            if (optgroupType === "RANGED") {
                type = "_chaps";
            } else if (optgroupType === "MAGIC") {
                type = "_robe_bottoms";
            } else {
                type = "_plate_legs";
            }
        }
        if (type === "body") {
            if (optgroupType === "RANGED") {
                type = "_tunic";
            } else if (optgroupType === "MAGIC") {
                type = "_robe_top";
            } else {
                type = "_plate_body";
            }
        }
        currentEquipment.value = "/items/" + value.toLowerCase() + type;
    });
    updateEquipmentState();
    updateUI();
}

// #endregion

// #region Combat Stats

function updateCombatStatsUI() {
    player.updateCombatDetails();

    let combatStyleElement = document.getElementById("combatStat_combatStyleHrid");
    let combatStyle = player.combatDetails.combatStats.combatStyleHrid;
    combatStyleElement.innerHTML = combatStyleDetailMap[combatStyle].name;

    let damageTypeElement = document.getElementById("combatStat_damageType");
    let damageType = damageTypeDetailMap[player.combatDetails.combatStats.damageType];
    damageTypeElement.innerHTML = damageType.name;

    let attackIntervalElement = document.getElementById("combatStat_attackInterval");
    attackIntervalElement.innerHTML = (player.combatDetails.combatStats.attackInterval / 1e9).toLocaleString() + "s";

    [
        "maxHitpoints",
        "maxManapoints",
        "stabAccuracyRating",
        "stabMaxDamage",
        "slashAccuracyRating",
        "slashMaxDamage",
        "smashAccuracyRating",
        "smashMaxDamage",
        "rangedAccuracyRating",
        "rangedMaxDamage",
        "magicAccuracyRating",
        "magicMaxDamage",
        "stabEvasionRating",
        "slashEvasionRating",
        "smashEvasionRating",
        "rangedEvasionRating",
        "magicEvasionRating",
        "totalArmor",
        "totalWaterResistance",
        "totalNatureResistance",
        "totalFireResistance",
        "totalThreat"
    ].forEach((stat) => {
        let element = document.getElementById("combatStat_" + stat);
        element.innerHTML = Math.floor(player.combatDetails[stat]);
    });

    [
        "abilityHaste",
        "tenacity"
    ].forEach((stat) => {
        let element = document.getElementById("combatStat_" + stat);
        element.innerHTML = Math.floor(player.combatDetails.combatStats[stat]);
    });

    [
        "physicalAmplify",
        "waterAmplify",
        "natureAmplify",
        "fireAmplify",
        "healingAmplify",
        "lifeSteal",
        "HPRegen",
        "MPRegen",
        "physicalReflectPower",
        "criticalRate",
        "criticalDamage",
        "combatExperience",
        "taskDamage",
        "armorPenetration",
        "waterPenetration",
        "naturePenetration",
        "firePenetration",
        "manaLeech",
        "castSpeed",
        "parry",
        "mayhem",
        "pierce",
        "curse",
        "attackSpeed"
    ].forEach((stat) => {
        let element = document.getElementById("combatStat_" + stat);
        let value = (100 * player.combatDetails.combatStats[stat]).toLocaleString([], {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
        });
        element.innerHTML = value + "%";
    });
}

// #endregion

// #region Level

function initLevelSection() {
    ["stamina", "intelligence", "attack", "power", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        levelInput.value = 1;
        levelInput.addEventListener("change", levelInputHandler);
    });
}

function levelInputHandler() {
    updateLevels();
    updateUI();
}

function updateLevels() {
    ["stamina", "intelligence", "attack", "power", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        player[skill + "Level"] = Number(levelInput.value);
    });
}

// #endregion

// #region Food

function initFoodSection() {
    for (let i = 0; i < 3; i++) {
        let element = document.getElementById("selectFood_" + i);

        let gameFoods = Object.values(itemDetailMap)
            .filter((item) => item.categoryHrid == "/item_categories/food")
            .sort((a, b) => a.sortIndex - b.sortIndex);

        for (const food of Object.values(gameFoods)) {
            element.add(new Option(food.name, food.hrid));
        }

        element.addEventListener("change", foodSelectHandler);
    }
}

function foodSelectHandler() {
    updateFoodState();
    updateUI();
}

function updateFoodState() {
    for (let i = 0; i < 3; i++) {
        let foodSelect = document.getElementById("selectFood_" + i);
        food[i] = foodSelect.value;
        if (food[i] && !triggerMap[food[i]]) {
            let gameItem = itemDetailMap[food[i]];
            triggerMap[food[i]] = structuredClone(gameItem.consumableDetail.defaultCombatTriggers);
        }
    }
}

function updateFoodUI() {
    for (let i = 0; i < 3; i++) {
        let selectElement = document.getElementById("selectFood_" + i);
        let triggerButton = document.getElementById("buttonFoodTrigger_" + i);

        selectElement.disabled = i >= player.combatDetails.combatStats.foodSlots;
        triggerButton.disabled = i >= player.combatDetails.combatStats.foodSlots || !food[i];
    }
}

// #endregion

// #region Drinks

function initDrinksSection() {
    for (let i = 0; i < 3; i++) {
        let element = document.getElementById("selectDrink_" + i);

        let gameDrinks = Object.values(itemDetailMap)
            .filter((item) => item.categoryHrid == "/item_categories/drink")
            .filter((item) => item.consumableDetail.usableInActionTypeMap["/action_types/combat"])
            .sort((a, b) => a.sortIndex - b.sortIndex);

        for (const drink of Object.values(gameDrinks)) {
            element.add(new Option(drink.name, drink.hrid));
        }

        element.addEventListener("change", drinkSelectHandler);
    }
}

function drinkSelectHandler() {
    updateDrinksState();
    updateDrinksUI();
}

function updateDrinksState() {
    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        drinks[i] = drinkSelect.value;
        if (drinks[i] && !triggerMap[drinks[i]]) {
            let gameItem = itemDetailMap[drinks[i]];
            triggerMap[drinks[i]] = structuredClone(gameItem.consumableDetail.defaultCombatTriggers);
        }
    }
}

function updateDrinksUI() {
    for (let i = 0; i < 3; i++) {
        let selectElement = document.getElementById("selectDrink_" + i);
        let triggerButton = document.getElementById("buttonDrinkTrigger_" + i);

        selectElement.disabled = i >= player.combatDetails.combatStats.drinkSlots;
        triggerButton.disabled = i >= player.combatDetails.combatStats.drinkSlots || !drinks[i];
    }
}

// #endregion

// #region Abilities

function initAbilitiesSection() {
    for (let i = 0; i < 5; i++) {
        let selectElement = document.getElementById("selectAbility_" + i);
        let inputElement = document.getElementById("inputAbilityLevel_" + i);

        inputElement.value = 1;

        let gameAbilities;
        if (i == 0) {
            gameAbilities = Object.values(abilityDetailMap).filter(x => x.isSpecialAbility && x.name !== "Promote").sort((a, b) => a.sortIndex - b.sortIndex);
        } else {
            gameAbilities = Object.values(abilityDetailMap).filter(x => !x.isSpecialAbility).sort((a, b) => a.sortIndex - b.sortIndex);
        }


        for (const ability of Object.values(gameAbilities)) {
            selectElement.add(new Option(ability.name, ability.hrid));
        }

        selectElement.addEventListener("change", abilitySelectHandler);
    }
}

function abilitySelectHandler() {
    updateAbilityState();
    updateAbilityUI();
}

function updateAbilityState() {
    for (let i = 0; i < 5; i++) {
        let abilitySelect = document.getElementById("selectAbility_" + i);
        abilities[i] = abilitySelect.value;
        if (abilities[i] && !triggerMap[abilities[i]]) {
            let gameAbility = abilityDetailMap[abilities[i]];
            triggerMap[abilities[i]] = structuredClone(gameAbility.defaultCombatTriggers);
        }
    }
}

function updateAbilityUI() {
    for (let i = 0; i < 5; i++) {
        let selectElement = document.getElementById("selectAbility_" + i);
        let inputElement = document.getElementById("inputAbilityLevel_" + i);
        let triggerButton = document.getElementById("buttonAbilityTrigger_" + i);

        selectElement.disabled = player.intelligenceLevel < abilitySlotsLevelRequirementList[i + 1];
        inputElement.disabled = player.intelligenceLevel < abilitySlotsLevelRequirementList[i + 1];
        triggerButton.disabled = player.intelligenceLevel < abilitySlotsLevelRequirementList[i + 1] || !abilities[i];
    }
}

// #endregion

// #region Trigger

function initTriggerModal() {
    let modal = document.getElementById("triggerModal");
    modal.addEventListener("show.bs.modal", (event) => triggerModalShownHandler(event));

    let triggerSaveButton = document.getElementById("buttonTriggerModalSave");
    triggerSaveButton.addEventListener("click", (event) => triggerModalSaveHandler(event));

    let triggerAddButton = document.getElementById("buttonAddTrigger");
    triggerAddButton.addEventListener("click", (event) => triggerAddButtonHandler(event));

    let triggerDefaultButton = document.getElementById("buttonDefaultTrigger");
    triggerDefaultButton.addEventListener("click", (event) => triggerDefaultButtonHandler(event));

    for (let i = 0; i < 4; i++) {
        let triggerDependencySelect = document.getElementById("selectTriggerDependency_" + i);
        let triggerConditionSelect = document.getElementById("selectTriggerCondition_" + i);
        let triggerComparatorSelect = document.getElementById("selectTriggerComparator_" + i);
        let triggerValueInput = document.getElementById("inputTriggerValue_" + i);
        let triggerRemoveButton = document.getElementById("buttonRemoveTrigger_" + i);

        triggerDependencySelect.addEventListener("change", (event) => triggerDependencySelectHandler(event, i));
        triggerConditionSelect.addEventListener("change", (event) => triggerConditionSelectHandler(event, i));
        triggerComparatorSelect.addEventListener("change", (event) => triggerComparatorSelectHander(event, i));
        triggerValueInput.addEventListener("change", (event) => triggerValueInputHandler(event, i));
        triggerRemoveButton.addEventListener("click", (event) => triggerRemoveButtonHandler(event, i));
    }
}

function triggerModalShownHandler(event) {
    let triggerButton = event.relatedTarget;

    let triggerType = triggerButton.getAttribute("data-bs-triggertype");
    let triggerIndex = Number(triggerButton.getAttribute("data-bs-triggerindex"));

    let triggerTarget;
    switch (triggerType) {
        case "food":
            triggerTarget = food[triggerIndex];
            break;
        case "drink":
            triggerTarget = drinks[triggerIndex];
            break;
        case "ability":
            triggerTarget = abilities[triggerIndex];
            break;
    }

    let triggerTargetnput = document.getElementById("inputModalTriggerTarget");
    triggerTargetnput.value = triggerTarget;
    modalTriggers = triggerMap[triggerTarget];
    updateTriggerModal();
}

function triggerModalSaveHandler(event) {
    let triggerTargetnput = document.getElementById("inputModalTriggerTarget");
    let triggerTarget = triggerTargetnput.value;

    triggerMap[triggerTarget] = modalTriggers;
}

function triggerDependencySelectHandler(event, index) {
    modalTriggers[index].dependencyHrid = event.target.value;
    modalTriggers[index].conditionHrid = "";
    modalTriggers[index].comparatorHrid = "";
    modalTriggers[index].value = 0;

    updateTriggerModal();
}

function triggerConditionSelectHandler(event, index) {
    modalTriggers[index].conditionHrid = event.target.value;
    modalTriggers[index].comparatorHrid = "";
    modalTriggers[index].value = 0;

    updateTriggerModal();
}

function triggerComparatorSelectHander(event, index) {
    modalTriggers[index].comparatorHrid = event.target.value;

    updateTriggerModal();
}

function triggerValueInputHandler(event, index) {
    modalTriggers[index].value = Number(event.target.value);

    updateTriggerModal();
}

function triggerRemoveButtonHandler(event, index) {
    modalTriggers.splice(index, 1);

    updateTriggerModal();
}

function triggerAddButtonHandler(event) {
    if (modalTriggers.length == 4) {
        return;
    }

    modalTriggers.push({
        dependencyHrid: "",
        conditionHrid: "",
        comparatorHrid: "",
        value: 0,
    });

    updateTriggerModal();
}

function triggerDefaultButtonHandler(event) {
    let triggerTargetnput = document.getElementById("inputModalTriggerTarget");
    let triggerTarget = triggerTargetnput.value;

    if (triggerTarget.startsWith("/items/")) {
        modalTriggers = structuredClone(itemDetailMap[triggerTarget].consumableDetail.defaultCombatTriggers);
    } else {
        modalTriggers = structuredClone(abilityDetailMap[triggerTarget].defaultCombatTriggers);
    }

    updateTriggerModal();
}

function updateTriggerModal() {
    let triggerStartTextElement = document.getElementById("triggerStartText");
    if (modalTriggers.length == 0) {
        triggerStartTextElement.innerHTML = "Activate as soon as it's off cooldown";
    } else {
        triggerStartTextElement.innerHTML = "Activate when:";
    }

    let triggerAddButton = document.getElementById("buttonAddTrigger");
    triggerAddButton.disabled = modalTriggers.length == 4;

    let triggersValid = true;

    for (let i = 0; i < 4; i++) {
        let triggerElement = document.getElementById("modalTrigger_" + i);

        if (!modalTriggers[i]) {
            hideElement(triggerElement);
            continue;
        }

        showElement(triggerElement);

        let triggerDependencySelect = document.getElementById("selectTriggerDependency_" + i);
        let triggerConditionSelect = document.getElementById("selectTriggerCondition_" + i);
        let triggerComparatorSelect = document.getElementById("selectTriggerComparator_" + i);
        let triggerValueInput = document.getElementById("inputTriggerValue_" + i);

        showElement(triggerDependencySelect);
        fillTriggerDependencySelect(triggerDependencySelect);

        if (modalTriggers[i].dependencyHrid == "") {
            hideElement(triggerConditionSelect);
            hideElement(triggerComparatorSelect);
            hideElement(triggerValueInput);
            triggersValid = false;
            continue;
        }

        triggerDependencySelect.value = modalTriggers[i].dependencyHrid;
        showElement(triggerConditionSelect);
        fillTriggerConditionSelect(triggerConditionSelect, modalTriggers[i].dependencyHrid);

        if (modalTriggers[i].conditionHrid == "") {
            hideElement(triggerComparatorSelect);
            hideElement(triggerValueInput);
            triggersValid = false;
            continue;
        }

        triggerConditionSelect.value = modalTriggers[i].conditionHrid;
        showElement(triggerComparatorSelect);
        fillTriggerComparatorSelect(triggerComparatorSelect, modalTriggers[i].conditionHrid);

        if (modalTriggers[i].comparatorHrid == "") {
            hideElement(triggerValueInput);
            triggersValid = false;
            continue;
        }

        triggerComparatorSelect.value = modalTriggers[i].comparatorHrid;

        if (combatTriggerComparatorDetailMap[modalTriggers[i].comparatorHrid].allowValue) {
            showElement(triggerValueInput);
            triggerValueInput.value = modalTriggers[i].value;
        } else {
            hideElement(triggerValueInput);
        }
    }

    let triggerSaveButton = document.getElementById("buttonTriggerModalSave");
    triggerSaveButton.disabled = !triggersValid;
}

function fillTriggerDependencySelect(element) {
    element.length = 0;
    element.add(new Option("", ""));

    for (const dependency of Object.values(combatTriggerDependencyDetailMap).sort(
        (a, b) => a.sortIndex - b.sortIndex
    )) {
        element.add(new Option(dependency.name, dependency.hrid));
    }
}

function fillTriggerConditionSelect(element, dependencyHrid) {
    let dependency = combatTriggerDependencyDetailMap[dependencyHrid];

    let conditions;
    if (dependency.isSingleTarget) {
        conditions = Object.values(combatTriggerConditionDetailMap).filter((condition) => condition.isSingleTarget);
    } else {
        conditions = Object.values(combatTriggerConditionDetailMap).filter((condition) => condition.isMultiTarget);
    }

    element.length = 0;
    element.add(new Option("", ""));

    for (const condition of Object.values(conditions).sort((a, b) => a.sortIndex - b.sortIndex)) {
        element.add(new Option(condition.name, condition.hrid));
    }
}

function fillTriggerComparatorSelect(element, conditionHrid) {
    let condition = combatTriggerConditionDetailMap[conditionHrid];

    let comparators = condition.allowedComparatorHrids.map((hrid) => combatTriggerComparatorDetailMap[hrid]);

    element.length = 0;
    element.add(new Option("", ""));

    for (const comparator of Object.values(comparators).sort((a, b) => a.sortIndex - b.sortIndex)) {
        element.add(new Option(comparator.name, comparator.hrid));
    }
}

function hideElement(element) {
    element.classList.remove("d-flex");
    element.classList.add("d-none");
}

function showElement(element) {
    element.classList.remove("d-none");
    element.classList.add("d-flex");
}

// #endregion

// #region Zones

function initZones() {
    let zoneSelect = document.getElementById("selectZone");

    

    for (const zone of Object.values(gameZones)) {
        zoneSelect.add(new Option(zone.name, zone.hrid));
    }
}

// #endregion

// #region Simulation Result

function showSimulationResult(simResult) {
    let expensesModalTable = document.querySelector("#expensesTable > tbody");
    expensesModalTable.innerHTML = '<tr><th>Item</th><th>Price</th><th>Amount</th><th>Total</th></tr>';
    let revenueModalTable = document.querySelector("#revenueTable > tbody");
    revenueModalTable.innerHTML = '<tr><th>Item</th><th>Price</th><th>Amount</th><th>Total</th></tr>';
    let noRngRevenueModalTable = document.querySelector("#noRngRevenueTable > tbody");
    noRngRevenueModalTable.innerHTML = '<tr><th>Item</th><th>Price</th><th>Amount</th><th>Total</th></tr>';
    showKills(simResult);
    showDeaths(simResult);
    showExperienceGained(simResult);
    showConsumablesUsed(simResult);
    showHpSpent(simResult);
    showManaUsed(simResult);
    showHitpointsGained(simResult);
    showManapointsGained(simResult);
    showDamageDone(simResult);
    showDamageTaken(simResult);
    window.profit = window.revenue - window.expenses;
    document.getElementById('profitSpan').innerText = window.profit.toLocaleString();
    document.getElementById('profitPreview').innerText = window.profit.toLocaleString();
    window.noRngProfit = window.noRngRevenue - window.expenses;
    document.getElementById('noRngProfitSpan').innerText = window.noRngProfit.toLocaleString();
    document.getElementById('noRngProfitPreview').innerText = window.noRngProfit.toLocaleString();
}

function showKills(simResult) {
    let resultDiv = document.getElementById("simulationResultKills");
    let dropsResultDiv = document.getElementById("simulationResultDrops");
    let noRngDropsResultDiv = document.getElementById("noRngDrops");
    let newChildren = [];
    let newDropChildren = [];
    let newNoRngDropChildren = [];
    let dropRateMultiplier = simResult.dropRateMultiplier;
    let rareFindMultiplier = simResult.rareFindMultiplier;

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
    let playerDeaths = simResult.deaths["player"] ?? 0;
    let encountersPerHour = (simResult.encounters / hoursSimulated).toFixed(1);

    let encountersRow = createRow(["col-md-6", "col-md-6 text-end"], ["Encounters", encountersPerHour]);
    newChildren.push(encountersRow);

    let monsters = Object.keys(simResult.deaths)
        .filter((enemy) => enemy != "player")
        .sort(); 

    const totalDropMap = new Map();
    const noRngTotalDropMap = new Map();
    for (const monster of monsters) {
        let killsPerHour = (simResult.deaths[monster] / hoursSimulated).toFixed(1);
        let monsterRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [combatMonsterDetailMap[monster].name, killsPerHour]
        );
        newChildren.push(monsterRow);

        const dropMap = new Map();
        const rareDropMap = new Map();
        for (const drop of combatMonsterDetailMap[monster].dropTable) {
            if (drop.minEliteTier > simResult.eliteTier) {
                continue;
            }
            dropMap.set(itemDetailMap[drop.itemHrid]['name'], { "dropRate": Math.min(1, drop.dropRate * dropRateMultiplier), "number": 0, "dropMin": drop.minCount, "dropMax": drop.maxCount, "noRngDropAmount": 0 });
        }
        for (const drop of combatMonsterDetailMap[monster].rareDropTable) {
            if (drop.minEliteTier > simResult.eliteTier) {
                continue;
            }
            rareDropMap.set(itemDetailMap[drop.itemHrid]['name'], { "dropRate": drop.dropRate * rareFindMultiplier, "number": 0, "dropMin": drop.minCount, "dropMax": drop.maxCount, "noRngDropAmount": 0 });
        }

        for (let dropObject of dropMap.values()) {
            dropObject.noRngDropAmount += simResult.deaths[monster] * dropObject.dropRate * ((dropObject.dropMax + dropObject.dropMin) / 2);
        }
        for (let dropObject of rareDropMap.values()) {
            dropObject.noRngDropAmount += simResult.deaths[monster] * dropObject.dropRate * ((dropObject.dropMax + dropObject.dropMin) / 2);
        }

        for (let i = 0; i < simResult.deaths[monster]; i++) {
            for (let dropObject of dropMap.values()) {
                let chance = Math.random();
                if (chance <= dropObject.dropRate) {
                    let amount = Math.floor(Math.random() * (dropObject.dropMax - dropObject.dropMin + 1) + dropObject.dropMin)
                    dropObject.number = dropObject.number + amount;
                }
            }
            for (let dropObject of rareDropMap.values()) {
                let chance = Math.random();
                if (chance <= dropObject.dropRate) {
                    let amount = Math.floor(Math.random() * (dropObject.dropMax - dropObject.dropMin + 1) + dropObject.dropMin)
                    dropObject.number = dropObject.number + amount;
                }
            }
        }
        for (let [name, dropObject] of dropMap.entries()) {
            if (totalDropMap.has(name)) {
                totalDropMap.set(name, totalDropMap.get(name) + dropObject.number);
            } else {
                totalDropMap.set(name, dropObject.number);
            }
            if (noRngTotalDropMap.has(name)) {
                noRngTotalDropMap.set(name, noRngTotalDropMap.get(name) + dropObject.noRngDropAmount);
            } else {
                noRngTotalDropMap.set(name, dropObject.noRngDropAmount);
            }
        }
        for (let [name, dropObject] of rareDropMap.entries()) {
            if (totalDropMap.has(name)) {
                totalDropMap.set(name, totalDropMap.get(name) + dropObject.number);
            } else {
                totalDropMap.set(name, dropObject.number);
            }
            if (noRngTotalDropMap.has(name)) {
                noRngTotalDropMap.set(name, noRngTotalDropMap.get(name) + dropObject.noRngDropAmount);
            } else {
                noRngTotalDropMap.set(name, dropObject.noRngDropAmount);
            }
        }
    }

    let revenueModalTable = document.querySelector("#revenueTable > tbody");
    let total = 0;
    for (let [name, dropAmount] of totalDropMap.entries()) {
        let dropRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [name, dropAmount.toLocaleString()]
        );
        newDropChildren.push(dropRow);

        let tableRow = '<tr class="' + name.replace(/\s+/g, '') + '"><td>';
        tableRow += name;
        tableRow += '</td><td contenteditable="true">';
        let price = -1;
        let revenueSetting = document.getElementById('selectPrices_drops').value;
        if (window.prices) {
            let item = window.prices[name];
            if (item) {
                if (revenueSetting == 'bid') {
                    if (item['bid'] !== -1) {
                        price = item['bid'];
                    } else if (item['ask'] !== -1) {
                        price = item['ask'];
                    }
                } else if (revenueSetting == 'ask') {
                    if (item['ask'] !== -1) {
                        price = item['ask'];
                    } else if (item['bid'] !== -1) {
                        price = item['bid'];
                    }
                }
                if (price == -1) {
                    price = item['vendor'];
                }
            }
        }
        tableRow += price;
        tableRow += '</td><td>';
        tableRow += dropAmount;
        tableRow += '</td><td>';
        tableRow += price * dropAmount;
        tableRow += '</td></tr>';
        revenueModalTable.innerHTML += tableRow;
        total += price * dropAmount;
    }



    let noRngRevenueModalTable = document.querySelector("#noRngRevenueTable > tbody");
    let noRngTotal = 0;
    for (let [name, dropAmount] of noRngTotalDropMap.entries()) {
        let noRngDropRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [name, dropAmount.toLocaleString()]
        );
        newNoRngDropChildren.push(noRngDropRow);

        let tableRow = '<tr class="' + name.replace(/\s+/g, '') + '"><td>';
        tableRow += name;
        tableRow += '</td><td contenteditable="true">';
        let price = -1;
        let revenueSetting = document.getElementById('selectPrices_drops').value;
        if (window.prices) {
            let item = window.prices[name];
            if (item) {
                if (revenueSetting == 'bid') {
                    if (item['bid'] !== -1) {
                        price = item['bid'];
                    } else if (item['ask'] !== -1) {
                        price = item['ask'];
                    }
                } else if (revenueSetting == 'ask') {
                    if (item['ask'] !== -1) {
                        price = item['ask'];
                    } else if (item['bid'] !== -1) {
                        price = item['bid'];
                    }
                }
                if (price == -1) {
                    price = item['vendor'];
                }
            }
        }
        tableRow += price;
        tableRow += '</td><td>';
        tableRow += dropAmount;
        tableRow += '</td><td>';
        tableRow += price * dropAmount;
        tableRow += '</td></tr>';
        noRngRevenueModalTable.innerHTML += tableRow;
        noRngTotal += price * dropAmount;
    }

    document.getElementById('revenueSpan').innerText = total.toLocaleString();
    window.revenue = total;
    document.getElementById('noRngRevenueSpan').innerText = noRngTotal.toLocaleString();
    window.noRngRevenue = noRngTotal;

    let resultAccordion = document.getElementById("noRngDropsAccordion");
    showElement(resultAccordion);

    resultDiv.replaceChildren(...newChildren);
    dropsResultDiv.replaceChildren(...newDropChildren);
    noRngDropsResultDiv.replaceChildren(...newNoRngDropChildren);
}

function calculateTotalProfit(simResult) {
    let dropRateMultiplier = simResult.dropRateMultiplier;
    let rareFindMultiplier = simResult.rareFindMultiplier;

    let monsters = Object.keys(simResult.deaths)
        .filter((enemy) => enemy != "player")
        .sort();

    const totalDropMap = new Map();
    const noRngTotalDropMap = new Map();
    for (const monster of monsters) {
        const dropMap = new Map();
        const rareDropMap = new Map();
        for (const drop of combatMonsterDetailMap[monster].dropTable) {
            if (drop.minEliteTier > simResult.eliteTier) {
                continue;
            }
            dropMap.set(itemDetailMap[drop.itemHrid]['name'], { "dropRate": Math.min(1, drop.dropRate * dropRateMultiplier), "number": 0, "dropMin": drop.minCount, "dropMax": drop.maxCount, "noRngDropAmount": 0 });
        }
        for (const drop of combatMonsterDetailMap[monster].rareDropTable) {
            if (drop.minEliteTier > simResult.eliteTier) {
                continue;
            }
            rareDropMap.set(itemDetailMap[drop.itemHrid]['name'], { "dropRate": drop.dropRate * rareFindMultiplier, "number": 0, "dropMin": drop.minCount, "dropMax": drop.maxCount, "noRngDropAmount": 0 });
        }

        for (let dropObject of dropMap.values()) {
            dropObject.noRngDropAmount += simResult.deaths[monster] * dropObject.dropRate * ((dropObject.dropMax + dropObject.dropMin) / 2);
        }
        for (let dropObject of rareDropMap.values()) {
            dropObject.noRngDropAmount += simResult.deaths[monster] * dropObject.dropRate * ((dropObject.dropMax + dropObject.dropMin) / 2);
        }

        for (let i = 0; i < simResult.deaths[monster]; i++) {
            for (let dropObject of dropMap.values()) {
                let chance = Math.random();
                if (chance <= dropObject.dropRate) {
                    let amount = Math.floor(Math.random() * (dropObject.dropMax - dropObject.dropMin + 1) + dropObject.dropMin)
                    dropObject.number = dropObject.number + amount;
                }
            }
            for (let dropObject of rareDropMap.values()) {
                let chance = Math.random();
                if (chance <= dropObject.dropRate) {
                    let amount = Math.floor(Math.random() * (dropObject.dropMax - dropObject.dropMin + 1) + dropObject.dropMin)
                    dropObject.number = dropObject.number + amount;
                }
            }
        }
        for (let [name, dropObject] of dropMap.entries()) {
            if (totalDropMap.has(name)) {
                totalDropMap.set(name, totalDropMap.get(name) + dropObject.number);
            } else {
                totalDropMap.set(name, dropObject.number);
            }
            if (noRngTotalDropMap.has(name)) {
                noRngTotalDropMap.set(name, noRngTotalDropMap.get(name) + dropObject.noRngDropAmount);
            } else {
                noRngTotalDropMap.set(name, dropObject.noRngDropAmount);
            }
        }
        for (let [name, dropObject] of rareDropMap.entries()) {
            if (totalDropMap.has(name)) {
                totalDropMap.set(name, totalDropMap.get(name) + dropObject.number);
            } else {
                totalDropMap.set(name, dropObject.number);
            }
            if (noRngTotalDropMap.has(name)) {
                noRngTotalDropMap.set(name, noRngTotalDropMap.get(name) + dropObject.noRngDropAmount);
            } else {
                noRngTotalDropMap.set(name, dropObject.noRngDropAmount);
            }
        }
    }

    let total = 0;
    for (let [name, dropAmount] of totalDropMap.entries()) {
        let price = -1;
        let revenueSetting = document.getElementById('selectPrices_drops').value;
        if (window.prices) {
            let item = window.prices[name];
            if (item) {
                if (revenueSetting == 'bid') {
                    if (item['bid'] !== -1) {
                        price = item['bid'];
                    } else if (item['ask'] !== -1) {
                        price = item['ask'];
                    }
                } else if (revenueSetting == 'ask') {
                    if (item['ask'] !== -1) {
                        price = item['ask'];
                    } else if (item['bid'] !== -1) {
                        price = item['bid'];
                    }
                }
                if (price == -1) {
                    price = item['vendor'];
                }
            }
        }
        total += price * dropAmount;
    }
    return total;
}

function showDeaths(simResult) {
    let resultDiv = document.getElementById("simulationResultPlayerDeaths");

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
    let playerDeaths = simResult.deaths["player"] ?? 0;
    let deathsPerHour = (playerDeaths / hoursSimulated).toFixed(2);

    let deathRow = createRow(["col-md-6", "col-md-6 text-end"], ["Player", deathsPerHour]);
    resultDiv.replaceChildren(deathRow);
}

function showExperienceGained(simResult) {
    let resultDiv = document.getElementById("simulationResultExperienceGain");
    let newChildren = [];

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;

    let totalExperience = Object.values(simResult.experienceGained["player"]).reduce((prev, cur) => prev + cur, 0);
    let totalExperiencePerHour = (totalExperience / hoursSimulated).toFixed(0);
    let totalRow = createRow(["col-md-6", "col-md-6 text-end"], ["Total", totalExperiencePerHour]);
    newChildren.push(totalRow);

    ["Stamina", "Intelligence", "Attack", "Power", "Defense", "Ranged", "Magic"].forEach((skill) => {
        let experience = simResult.experienceGained["player"][skill.toLowerCase()] ?? 0;
        if (experience == 0) {
            return;
        }
        let experiencePerHour = (experience / hoursSimulated).toFixed(0);
        let experienceRow = createRow(["col-md-6", "col-md-6 text-end"], [skill, experiencePerHour]);
        newChildren.push(experienceRow);
    });

    resultDiv.replaceChildren(...newChildren);
}

function showHpSpent(simResult) {
    let hpSpentHeadingDiv = document.getElementById("simulationHpSpentHeading");
    hpSpentHeadingDiv.classList.add("d-none");
    let hpSpentDiv = document.getElementById("simulationHpSpent");
    hpSpentDiv.classList.add("d-none");

    if (simResult.hitpointsSpent["player"]) {
        let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
        let hpSpentSources = [];
        for (const source of Object.keys(simResult.hitpointsSpent["player"])) {
            let hpSpentPerHour = (simResult.hitpointsSpent["player"][source] / hoursSimulated).toFixed(2);
            let hpSpentRow = createRow(["col-md-6", "col-md-6 text-end"], [abilityDetailMap[source].name, hpSpentPerHour]);
            hpSpentSources.push(hpSpentRow);
        }
        hpSpentDiv.replaceChildren(...hpSpentSources);
        hpSpentHeadingDiv.classList.remove("d-none");
        hpSpentDiv.classList.remove("d-none");
    }
}

function showConsumablesUsed(simResult) {
    let resultDiv = document.getElementById("simulationResultConsumablesUsed");
    let newChildren = [];

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;

    if (!simResult.consumablesUsed["player"]) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }

    let consumablesUsed = Object.entries(simResult.consumablesUsed["player"]).sort((a, b) => b[1] - a[1]);

    let expensesModalTable = document.querySelector("#expensesTable > tbody");
    let total = 0;
    for (const [consumable, amount] of consumablesUsed) {
        let consumablesPerHour = (amount / hoursSimulated).toFixed(0);
        let consumableRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [itemDetailMap[consumable].name, consumablesPerHour]
        );
        newChildren.push(consumableRow);

        let tableRow = '<tr class="' + itemDetailMap[consumable].name.replace(/\s+/g, '') + '"><td>';
        tableRow += itemDetailMap[consumable].name;
        tableRow += '</td><td contenteditable="true">';
        let price = -1;
        let expensesSetting = document.getElementById('selectPrices_consumables').value;
        if (window.prices) {
            let item = window.prices[itemDetailMap[consumable].name];
            if (item) {
                if (expensesSetting == 'bid') {
                    if (item['bid'] !== -1) {
                        price = item['bid'];
                    } else if (item['ask'] !== -1) {
                        price = item['ask'];
                    }
                } else if (expensesSetting == 'ask') {
                    if (item['ask'] !== -1) {
                        price = item['ask'];
                    } else if (item['bid'] !== -1) {
                        price = item['bid'];
                    }
                }
                if (price == -1) {
                    price = item['vendor'];
                }
            }
        }
        tableRow += price;
        tableRow += '</td><td>';
        tableRow += amount;
        tableRow += '</td><td>';
        tableRow += price * amount;
        tableRow += '</td></tr>';
        expensesModalTable.innerHTML += tableRow;
        total += price * amount;
    }

    document.getElementById('expensesSpan').innerText = total.toLocaleString();
    window.expenses = total;

    resultDiv.replaceChildren(...newChildren);
}

function showManaUsed(simResult) {
    let resultDiv = document.getElementById("simulationResultManaUsed");
    let newChildren = [];

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
    if (!simResult.manaUsed) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }
    for (let ability in simResult.manaUsed) {
        let manaPerHour = (simResult.manaUsed[ability] / hoursSimulated).toFixed(0);
        let castsPerHour = (manaPerHour / abilityDetailMap[ability].manaCost).toFixed(2);
        castsPerHour = " (" + castsPerHour + ")";
        let manaRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [ability.split("/")[2].replaceAll("_", " ") + castsPerHour, manaPerHour]
        );
        newChildren.push(manaRow);
    }

    resultDiv.replaceChildren(...newChildren);
}

function showHitpointsGained(simResult) {
    let resultDiv = document.getElementById("simulationResultHealthRestored");
    let newChildren = [];

    let secondsSimulated = simResult.simulatedTime / ONE_SECOND;

    if (!simResult.hitpointsGained["player"]) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }

    let hitpointsGained = Object.entries(simResult.hitpointsGained["player"]).sort((a, b) => b[1] - a[1]);

    let totalHitpointsGained = hitpointsGained.reduce((prev, cur) => prev + cur[1], 0);
    let totalHitpointsPerSecond = (totalHitpointsGained / secondsSimulated).toFixed(2);
    let totalRow = createRow(
        ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
        ["Total", totalHitpointsPerSecond, "100%"]
    );
    newChildren.push(totalRow);

    for (const [source, amount] of hitpointsGained) {
        if (amount == 0) {
            continue;
        }

        let sourceText;
        switch (source) {
            case "regen":
                sourceText = "Regen";
                break;
            case "lifesteal":
                sourceText = "Life Steal";
                break;
            default:
                if (itemDetailMap[source]) {
                    sourceText = itemDetailMap[source].name;
                } else if (abilityDetailMap[source]) {
                    sourceText = abilityDetailMap[source].name;
                }
                break;
        }
        let hitpointsPerSecond = (amount / secondsSimulated).toFixed(2);
        let percentage = ((100 * amount) / totalHitpointsGained).toFixed(0);

        let row = createRow(
            ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
            [sourceText, hitpointsPerSecond, percentage + "%"]
        );
        newChildren.push(row);
    }

    resultDiv.replaceChildren(...newChildren);
}

function showManapointsGained(simResult) {
    let resultDiv = document.getElementById("simulationResultManaRestored");
    let newChildren = [];

    let secondsSimulated = simResult.simulatedTime / ONE_SECOND;

    if (!simResult.manapointsGained["player"]) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }

    let manapointsGained = Object.entries(simResult.manapointsGained["player"]).sort((a, b) => b[1] - a[1]);

    let totalManapointsGained = manapointsGained.reduce((prev, cur) => prev + cur[1], 0);
    let totalManapointsPerSecond = (totalManapointsGained / secondsSimulated).toFixed(2);
    let totalRow = createRow(
        ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
        ["Total", totalManapointsPerSecond, "100%"]
    );
    newChildren.push(totalRow);

    for (const [source, amount] of manapointsGained) {
        if (amount == 0) {
            continue;
        }

        let sourceText;
        switch (source) {
            case "regen":
                sourceText = "Regen";
                break;
            case "manaLeech":
                sourceText = "Mana Leech"
                break;
            default:
                sourceText = itemDetailMap[source].name;
                break;
        }
        let manapointsPerSecond = (amount / secondsSimulated).toFixed(2);
        let percentage = ((100 * amount) / totalManapointsGained).toFixed(0);

        let row = createRow(
            ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
            [sourceText, manapointsPerSecond, percentage + "%"]
        );
        newChildren.push(row);
    }

    let ranOutOfManaText = simResult.playerRanOutOfMana ? "Yes" : "No";
    let ranOutOfManaRow = createRow(["col-md-6", "col-md-6 text-end"], ["Ran out of mana", ranOutOfManaText]);
    newChildren.push(ranOutOfManaRow);

    resultDiv.replaceChildren(...newChildren);
}

function showDamageDone(simResult) {
    let totalDamageDone = {};
    let enemyIndex = 1;

    let totalSecondsSimulated = simResult.simulatedTime / ONE_SECOND;

    for (let i = 1; i < 7; i++) {
        let accordion = document.getElementById("simulationResultDamageDoneAccordionEnemy" + i);
        hideElement(accordion);
    }

    let bossTimeHeadingDiv = document.getElementById("simulationBossTimeHeading");
    bossTimeHeadingDiv.classList.add("d-none");
    let bossTimeDiv = document.getElementById("simulationBossTime");
    bossTimeDiv.classList.add("d-none");

    for (const [target, abilities] of Object.entries(simResult.attacks["player"])) {
        let targetDamageDone = {};

        const i = simResult.timeSpentAlive.findIndex(e => e.name === target);
        let aliveSecondsSimulated = simResult.timeSpentAlive[i].timeSpentAlive / ONE_SECOND;

        for (const [ability, abilityCasts] of Object.entries(abilities)) {
            let casts = Object.values(abilityCasts).reduce((prev, cur) => prev + cur, 0);
            let misses = abilityCasts["miss"] ?? 0;
            let damage = Object.entries(abilityCasts)
                .filter((entry) => entry[0] != "miss")
                .reduce((prev, cur) => prev + Number(cur[0]) * cur[1], 0);

            targetDamageDone[ability] = {
                casts,
                misses,
                damage,
            };
            if (totalDamageDone[ability]) {
                totalDamageDone[ability].casts += casts;
                totalDamageDone[ability].misses += misses;
                totalDamageDone[ability].damage += damage;
            } else {
                totalDamageDone[ability] = {
                    casts,
                    misses,
                    damage,
                };
            }
        }

        let resultDiv = document.getElementById("simulationResultDamageDoneEnemy" + enemyIndex);
        createDamageTable(resultDiv, targetDamageDone, aliveSecondsSimulated);

        let resultAccordion = document.getElementById("simulationResultDamageDoneAccordionEnemy" + enemyIndex);
        showElement(resultAccordion);

        let resultAccordionButton = document.getElementById(
            "buttonSimulationResultDamageDoneAccordionEnemy" + enemyIndex
        );
        let targetName = combatMonsterDetailMap[target].name;
        resultAccordionButton.innerHTML = "<b>Damage Done (" + targetName + ")</b>";

        if (simResult.bossSpawns.includes(target)) {
            let hoursSpentOnBoss = (aliveSecondsSimulated / 60 / 60).toFixed(2);
            let percentSpentOnBoss = (aliveSecondsSimulated / totalSecondsSimulated * 100).toFixed(2);

            let bossRow = createRow(["col-md-6", "col-md-6 text-end"], [targetName, hoursSpentOnBoss + "h(" + percentSpentOnBoss + "%)"]);
            bossTimeDiv.replaceChildren(bossRow);

            bossTimeHeadingDiv.classList.remove("d-none");
            bossTimeDiv.classList.remove("d-none");
        }

        enemyIndex++;
    }

    let totalResultDiv = document.getElementById("simulationResultTotalDamageDone");
    createDamageTable(totalResultDiv, totalDamageDone, totalSecondsSimulated);
}

function showDamageTaken(simResult) {
    let totalDamageTaken = {};
    let enemyIndex = 1;

    let totalSecondsSimulated = simResult.simulatedTime / ONE_SECOND;

    for (let i = 1; i < 7; i++) {
        let accordion = document.getElementById("simulationResultDamageTakenAccordionEnemy" + i);
        hideElement(accordion);
    }

    for (const [source, targets] of Object.entries(simResult.attacks)) {
        if (source == "player") {
            continue;
        }

        const i = simResult.timeSpentAlive.findIndex(e => e.name === source);
        let aliveSecondsSimulated = simResult.timeSpentAlive[i].timeSpentAlive / ONE_SECOND;
        let sourceDamageTaken = {};

        for (const [ability, abilityCasts] of Object.entries(targets["player"])) {
            let casts = Object.values(abilityCasts).reduce((prev, cur) => prev + cur, 0);
            let misses = abilityCasts["miss"] ?? 0;
            let damage = Object.entries(abilityCasts)
                .filter((entry) => entry[0] != "miss")
                .reduce((prev, cur) => prev + Number(cur[0]) * cur[1], 0);

            sourceDamageTaken[ability] = {
                casts,
                misses,
                damage,
            };
            if (totalDamageTaken[ability]) {
                totalDamageTaken[ability].casts += casts;
                totalDamageTaken[ability].misses += misses;
                totalDamageTaken[ability].damage += damage;
            } else {
                totalDamageTaken[ability] = {
                    casts,
                    misses,
                    damage,
                };
            }
        }

        let resultDiv = document.getElementById("simulationResultDamageTakenEnemy" + enemyIndex);
        createDamageTable(resultDiv, sourceDamageTaken, aliveSecondsSimulated);

        let resultAccordion = document.getElementById("simulationResultDamageTakenAccordionEnemy" + enemyIndex);
        showElement(resultAccordion);

        let resultAccordionButton = document.getElementById(
            "buttonSimulationResultDamageTakenAccordionEnemy" + enemyIndex
        );
        let sourceName = combatMonsterDetailMap[source].name;
        resultAccordionButton.innerHTML = "<b>Damage Taken (" + sourceName + ")</b>";

        enemyIndex++;
    }

    let totalResultDiv = document.getElementById("simulationResultTotalDamageTaken");
    createDamageTable(totalResultDiv, totalDamageTaken, totalSecondsSimulated);
}

function createDamageTable(resultDiv, damageDone, secondsSimulated) {
    let newChildren = [];

    let sortedDamageDone = Object.entries(damageDone).sort((a, b) => b[1].damage - a[1].damage);

    let totalCasts = sortedDamageDone.reduce((prev, cur) => prev + cur[1].casts, 0);
    let totalMisses = sortedDamageDone.reduce((prev, cur) => prev + cur[1].misses, 0);
    let totalDamage = sortedDamageDone.reduce((prev, cur) => prev + cur[1].damage, 0);
    let totalHitChance = ((100 * (totalCasts - totalMisses)) / totalCasts).toFixed(1);
    let totalDamagePerSecond = (totalDamage / secondsSimulated).toFixed(2);

    let totalRow = createRow(
        ["col-md-5", "col-md-3 text-end", "col-md-2 text-end", "col-md-2 text-end"],
        ["Total", totalHitChance + "%", totalDamagePerSecond, "100%"]
    );
    newChildren.push(totalRow);

    for (const [ability, damageInfo] of sortedDamageDone) {
        let abilityText;
        switch (ability) {
            case "autoAttack":
                abilityText = "Auto Attack";
                break;
            case "damageOverTime":
                abilityText = "Damage Over Time";
                break;
            case "physicalReflect":
                abilityText = "Physical Reflect";
                break;
            default:
                abilityText = abilityDetailMap[ability].name;
                break;
        }

        let hitChance = ((100 * (damageInfo.casts - damageInfo.misses)) / damageInfo.casts).toFixed(1);
        let damagePerSecond = (damageInfo.damage / secondsSimulated).toFixed(2);
        let percentage = ((100 * damageInfo.damage) / totalDamage).toFixed(0);

        let row = createRow(
            ["col-md-5", "col-md-3 text-end", "col-md-2 text-end", "col-md-2 text-end"],
            [abilityText, hitChance + "%", damagePerSecond, percentage + "%"]
        );
        newChildren.push(row);
    }

    resultDiv.replaceChildren(...newChildren);
}

function createRow(columnClassNames, columnValues) {
    let row = createElement("div", "row");

    for (let i = 0; i < columnClassNames.length; i++) {
        let column = createElement("div", columnClassNames[i], columnValues[i]);
        row.appendChild(column);
    }

    return row;
}

function createElement(tagName, className, innerHTML = "") {
    let element = document.createElement(tagName);
    element.className = className;
    element.innerHTML = innerHTML;

    return element;
}

// #endregion

// #region Simulation Controls

function initSimulationControls() {
    let simulationTimeInput = document.getElementById("inputSimulationTime");
    simulationTimeInput.value = 100;

    buttonStartSimulation.addEventListener("click", (event) => {
        let invalidElements = document.querySelectorAll(":invalid");
        if (invalidElements.length > 0) {
            invalidElements.forEach((element) => element.reportValidity());
            return;
        }
        buttonStartSimulation.disabled = true;
        startSimulation();
    });
}

function startSimulation() {
    updateState();
    updateUI();

    for (let i = 0; i < 3; i++) {
        if (food[i] && i < player.combatDetails.combatStats.foodSlots) {
            let consumable = new Consumable(food[i], triggerMap[food[i]]);
            player.food[i] = consumable;
        } else {
            player.food[i] = null;
        }

        if (drinks[i] && i < player.combatDetails.combatStats.drinkSlots) {
            let consumable = new Consumable(drinks[i], triggerMap[drinks[i]]);
            player.drinks[i] = consumable;
        } else {
            player.drinks[i] = null;
        }
    }

    for (let i = 0; i < 5; i++) {
        if (abilities[i] && player.intelligenceLevel >= abilitySlotsLevelRequirementList[i + 1]) {
            let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
            let ability = new Ability(abilities[i], Number(abilityLevelInput.value), triggerMap[abilities[i]]);
            player.abilities[i] = ability;
        } else {
            player.abilities[i] = null;
        }
    }

    let zoneSelect = document.getElementById("selectZone");
    let simulationTimeInput = document.getElementById("inputSimulationTime");

    let simulationTimeLimit = Number(simulationTimeInput.value) * ONE_HOUR;

    let workerMessage = {
        type: "start_simulation",
        player: player,
        zoneHrid: zoneSelect.value,
        simulationTimeLimit: simulationTimeLimit,
    };

    worker.postMessage(workerMessage);
}

// #endregion

// #region All Zones Result

function showAllZonesSimulationResult() {
    const table = document.getElementById("AllSimulationsResults")
    const headers = [ "Zone", "Kills", "Deaths", "XP", "Profit" ]
    table.innerHTML = `
    <thead>
                  <tr>
                  ${headers.map(header => `<th scope="col">${header}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                ${Object.entries(allZonesSimulationResults).map(([ zone, result ]) => {
                    let monsters = Object.entries(result.deaths)
                        .filter(([name,value]) => name != "player")
                        .reduce((a, [name,value]) => a + value, 0);
                    console.log()
                    return `<tr>
                    <th scope="row">${zone}</th>
                    <td>${(monsters / ALL_ZONES_SIM_TIME).toFixed(1)}</td>
                    <td>${result.deaths.player || 0}</td>
                    <td>${(Object.values(result.experienceGained.player).reduce((a,b) => a + b) / 5).toFixed(1)}</td>
                    <td>${calculateTotalProfit(result)}</td>
                  </tr>`
                }).join('')}
                </tbody>
    `
    console.log(table);
}

// #endregion

// #region All Zones Controls

function initAllZonesSimulationControls() {
    buttonStartAllZonesSimulation.addEventListener("click", (event) => {
        let invalidElements = document.querySelectorAll(":invalid");
        if (invalidElements.length > 0) {
            invalidElements.forEach((element) => element.reportValidity());
            return;
        }
        buttonStartAllZonesSimulation.disabled = true;
        startAllSimulations();
    });
}

function startAllSimulations() {
    updateState();
    updateUI();

    for (let i = 0; i < 3; i++) {
        if (food[i] && i < player.combatDetails.combatStats.foodSlots) {
            let consumable = new Consumable(food[i], triggerMap[food[i]]);
            player.food[i] = consumable;
        } else {
            player.food[i] = null;
        }

        if (drinks[i] && i < player.combatDetails.combatStats.drinkSlots) {
            let consumable = new Consumable(drinks[i], triggerMap[drinks[i]]);
            player.drinks[i] = consumable;
        } else {
            player.drinks[i] = null;
        }
    }

    for (let i = 0; i < 5; i++) {
        if (abilities[i] && player.intelligenceLevel >= abilitySlotsLevelRequirementList[i + 1]) {
            let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
            let ability = new Ability(abilities[i], Number(abilityLevelInput.value), triggerMap[abilities[i]]);
            player.abilities[i] = ability;
        } else {
            player.abilities[i] = null;
        }
    }
 

    for (let zone of gameZones.map(i => i.hrid)) {
        let workerMessage = {
            type: "start_simulation",
            player: player,
            zoneHrid: zone,
            simulationTimeLimit: ALL_ZONES_SIM_TIME * ONE_HOUR,
        };
        let worker = new Worker(new URL("worker.js", import.meta.url));
        worker.onmessage = function (event) {
            switch (event.data.type) {
                case "simulation_result":
                    allZonesSimulationProgress[ event.data.zoneHrid ] = 1
                    allZonesSimulationResults[event.data.zoneHrid] = event.data.simResult
                    let isAllDone = Object.values(allZonesSimulationProgress).every((value) => value === 1);
                    if (isAllDone) {
                        allZonesProgressbar.style.width = "100%";
                        allZonesProgressbar.innerHTML = "100%";
                        console.log(allZonesSimulationResults);
                        for (const zone of gameZones) {
                            allZonesSimulationProgress[zone.hrid] = 0;
                        }
                        showAllZonesSimulationResult();
                        buttonStartAllZonesSimulation.disabled = false;
                    }
                    break;
                case "simulation_progress":
                    allZonesSimulationProgress[ event.data.zoneHrid ] = event.data.simResult
                    let values = Object.values(allZonesSimulationProgress).filter((i) => i !== undefined);
                    let progressPercent = Math.floor(values.reduce((acc, curr) => acc + curr) / values.length * 100);
                    allZonesProgressbar.style.width = progressPercent + "%";
                    allZonesProgressbar.innerHTML = progressPercent + "%";
                    break;
                case "simulation_error":
                    showErrorModal(event.data.error.toString());
                    break;
            }
        };
        worker.postMessage(workerMessage);
    }
}

// #endregion

// #region Equipment Sets

function initEquipmentSetsModal() {
    let equipmentSetsModal = document.getElementById("equipmentSetsModal");
    equipmentSetsModal.addEventListener("show.bs.modal", equipmentSetsModalShownHandler);

    let equipmentSetNameInput = document.getElementById("inputEquipmentSetName");
    equipmentSetNameInput.addEventListener("input", (event) => equipmentSetNameChangedHandler(event));

    let createEquipmentSetButton = document.getElementById("buttonCreateNewEquipmentSet");
    createEquipmentSetButton.addEventListener("click", createNewEquipmentSetHandler);
}

function equipmentSetsModalShownHandler() {
    resetNewEquipmentSetControls();
    updateEquipmentSetList();
}

function resetNewEquipmentSetControls() {
    let equipmentSetNameInput = document.getElementById("inputEquipmentSetName");
    equipmentSetNameInput.value = "";

    let createEquipmentSetButton = document.getElementById("buttonCreateNewEquipmentSet");
    createEquipmentSetButton.disabled = true;
}

function updateEquipmentSetList() {
    let newChildren = [];
    let equipmentSets = loadEquipmentSets();

    for (const equipmentSetName of Object.keys(equipmentSets)) {
        let row = createElement("div", "row mb-2");

        let nameCol = createElement("div", "col align-self-center", equipmentSetName);
        row.appendChild(nameCol);

        let loadButtonCol = createElement("div", "col-md-auto");
        let loadButton = createElement("button", "btn btn-primary", "Load");
        loadButton.setAttribute("type", "button");
        loadButton.addEventListener("click", (_) => loadEquipmentSetHandler(equipmentSetName));
        loadButtonCol.appendChild(loadButton);
        row.appendChild(loadButtonCol);

        let saveButtonCol = createElement("div", "col-md-auto");
        let saveButton = createElement("button", "btn btn-primary", "Save");
        saveButton.setAttribute("type", "button");
        saveButton.addEventListener("click", (_) => updateEquipmentSetHandler(equipmentSetName));
        saveButtonCol.appendChild(saveButton);
        row.appendChild(saveButtonCol);

        let deleteButtonCol = createElement("div", "col-md-auto");
        let deleteButton = createElement("button", "btn btn-danger", "Delete");
        deleteButton.setAttribute("type", "button");
        deleteButton.addEventListener("click", (_) => deleteEquipmentSetHandler(equipmentSetName));
        deleteButtonCol.appendChild(deleteButton);
        row.appendChild(deleteButtonCol);

        newChildren.push(row);
    }

    let equipmentSetList = document.getElementById("equipmentSetList");
    equipmentSetList.replaceChildren(...newChildren);
}

function equipmentSetNameChangedHandler(event) {
    let invalid = false;

    if (event.target.value.length == 0) {
        invalid = true;
    }

    let equipmentSets = loadEquipmentSets();
    if (equipmentSets[event.target.value]) {
        invalid = true;
    }

    let createEquipmentSetButton = document.getElementById("buttonCreateNewEquipmentSet");
    createEquipmentSetButton.disabled = invalid;
}

function createNewEquipmentSetHandler() {
    let equipmentSetNameInput = document.getElementById("inputEquipmentSetName");
    let equipmentSetName = equipmentSetNameInput.value;

    let equipmentSet = getEquipmentSetFromUI();
    let equipmentSets = loadEquipmentSets();
    equipmentSets[equipmentSetName] = equipmentSet;
    saveEquipmentSets(equipmentSets);

    resetNewEquipmentSetControls();
    updateEquipmentSetList();
}

function loadEquipmentSetHandler(name) {
    let equipmentSets = loadEquipmentSets();
    loadEquipmentSetIntoUI(equipmentSets[name]);
}

function updateEquipmentSetHandler(name) {
    let equipmentSet = getEquipmentSetFromUI();
    let equipmentSets = loadEquipmentSets();
    equipmentSets[name] = equipmentSet;
    saveEquipmentSets(equipmentSets);
}

function deleteEquipmentSetHandler(name) {
    let equipmentSets = loadEquipmentSets();
    delete equipmentSets[name];
    saveEquipmentSets(equipmentSets);

    updateEquipmentSetList();
}

function loadEquipmentSets() {
    return JSON.parse(localStorage.getItem("equipmentSets")) ?? {};
}

function saveEquipmentSets(equipmentSets) {
    localStorage.setItem("equipmentSets", JSON.stringify(equipmentSets));
}

function getEquipmentSetFromUI() {
    let equipmentSet = {
        levels: {},
        equipment: {},
        food: {},
        drinks: {},
        abilities: {},
        triggerMap: {},
        houseRooms: {},
    };

    ["stamina", "intelligence", "attack", "power", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        equipmentSet.levels[skill] = Number(levelInput.value);
    });

    ["head", "body", "legs", "feet", "hands", "weapon", "off_hand", "pouch", "neck", "earrings", "ring", "back"].forEach((type) => {
        let equipmentSelect = document.getElementById("selectEquipment_" + type);
        let enhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_" + type);

        equipmentSet.equipment[type] = {
            equipment: equipmentSelect.value,
            enhancementLevel: Number(enhancementLevelInput.value),
        };
    });

    for (let i = 0; i < 3; i++) {
        let foodSelect = document.getElementById("selectFood_" + i);
        equipmentSet.food[i] = foodSelect.value;
    }

    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        equipmentSet.drinks[i] = drinkSelect.value;
    }

    for (let i = 0; i < 5; i++) {
        let abilitySelect = document.getElementById("selectAbility_" + i);
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
        equipmentSet.abilities[i] = {
            ability: abilitySelect.value,
            level: Number(abilityLevelInput.value),
        };
    }

    equipmentSet.triggerMap = triggerMap;

    equipmentSet.houseRooms = player.houseRooms;

    return equipmentSet;
}

function loadEquipmentSetIntoUI(equipmentSet) {
    ["stamina", "intelligence", "attack", "power", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        levelInput.value = equipmentSet.levels[skill] ?? 1;
    });

    ["head", "body", "legs", "feet", "hands", "weapon", "off_hand", "pouch", "neck", "earrings", "ring", "back"].forEach((type) => {
        let equipmentSelect = document.getElementById("selectEquipment_" + type);
        let enhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_" + type);

        let currentEquipment = equipmentSet.equipment[type];
        if (currentEquipment !== undefined) {
            equipmentSelect.value = currentEquipment.equipment;
            enhancementLevelInput.value = currentEquipment.enhancementLevel;
        } else {
            equipmentSelect.value = "";
            enhancementLevelInput.value = 0;
        }
    });

    for (let i = 0; i < 3; i++) {
        let foodSelect = document.getElementById("selectFood_" + i);
        foodSelect.value = equipmentSet.food[i];
    }

    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        drinkSelect.value = equipmentSet.drinks[i];
    }

    let hasSpecial = false;
    if (equipmentSet.abilities && Object.keys(equipmentSet.abilities).length == 5) {
        hasSpecial = true;
    }

    for (let i = 0; i < (hasSpecial ? 5 : 4); i++) {
        let abilitySlot = hasSpecial ? i : (i + 1);
        let abilitySelect = document.getElementById("selectAbility_" + abilitySlot);
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + abilitySlot);

        abilitySelect.value = equipmentSet.abilities[i].ability;
        abilityLevelInput.value = equipmentSet.abilities[i].level;
    }

    triggerMap = equipmentSet.triggerMap;

    if (equipmentSet.houseRooms) {
        for (const room in equipmentSet.houseRooms) {
            const field = document.querySelector('[data-house-hrid="' + room + '"]');
            if (equipmentSet.houseRooms[room]) {
                field.value = equipmentSet.houseRooms[room];
            } else {
                field.value = '';
            }
        }
        player.houseRooms = equipmentSet.houseRooms;
    } else {
        let houseRooms = Object.values(houseRoomDetailMap);
        for (const room of Object.values(houseRooms)) {
            const field = document.querySelector('[data-house-hrid="' + room.hrid + '"]');
            field.value = '';
            player.houseRooms[room.hrid] = 0;
        }
    }

    updateState();
    updateUI();
}

// #endregion

// #region Error Handling

function initErrorHandling() {
    window.addEventListener("error", (event) => {
        showErrorModal(event.message);
    });

    let copyErrorButton = document.getElementById("buttonCopyError");
    copyErrorButton.addEventListener("click", (event) => {
        let errorInput = document.getElementById("inputError");
        navigator.clipboard.writeText(errorInput.value);
    });
}

function initImportExportModal() {
    let exportSetButton = document.getElementById("buttonExportSet");
    exportSetButton.addEventListener("click", (event) => {
        let zoneSelect = document.getElementById("selectZone");
        let simulationTimeInput = document.getElementById("inputSimulationTime");
        let equipmentArray = [];
        for (const item in player.equipment) {
            if (player.equipment[item] != null) {
                equipmentArray.push({
                    "itemLocationHrid": player.equipment[item].gameItem.equipmentDetail.type.replaceAll("equipment_types", "item_locations"),
                    "itemHrid": player.equipment[item].hrid,
                    "enhancementLevel": player.equipment[item].enhancementLevel
                });
            }
        }
    let playerArray = {
            "attackLevel": player.attackLevel,
            "magicLevel": player.magicLevel,
            "powerLevel": player.powerLevel,
            "rangedLevel": player.rangedLevel,
            "defenseLevel": player.defenseLevel,
            "staminaLevel": player.staminaLevel,
            "intelligenceLevel": player.intelligenceLevel,
            "equipment": equipmentArray
        };
        let abilitiesArray = [];
        for (let i = 0; i < 5; i++) {
            let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
            let abilityName = document.getElementById("selectAbility_" + i);
            abilitiesArray[i] = { "abilityHrid": abilityName.value, "level": abilityLevelInput.value };
        }
        let drinksArray = [];
        for (let i = 0; i < drinks?.length; i++) {
            drinksArray.push({ "itemHrid": drinks[i] });
        }
        let foodArray = [];
        for (let i = 0; i < food?.length; i++) {
            foodArray.push({ "itemHrid": food[i] });
        }
        let state = {
            player: playerArray,
            food: { "/action_types/combat": foodArray },
            drinks: { "/action_types/combat": drinksArray },
            abilities: abilitiesArray,
            triggerMap: triggerMap,
            zone: zoneSelect.value,
            simulationTime: simulationTimeInput.value,
            houseRooms: player.houseRooms
        };
        try {
            navigator.clipboard.writeText(JSON.stringify(state)).then(() => alert("Current set has been copied to clipboard."));
        } catch (err) {
            alert('Error copying to clipboard: ' + err);
        }
    });

    let importSetButton = document.getElementById("buttonImportSet");
    importSetButton.addEventListener("click", (event) => {
        let importSet = document.getElementById("inputSet").value;
        importSet = JSON.parse(importSet);
    ["stamina", "intelligence", "attack", "power", "defense", "ranged", "magic"].forEach((skill) => {
            let levelInput = document.getElementById("inputLevel_" + skill);
            levelInput.value = importSet.player[skill + "Level"];
        });

        ["head", "body", "legs", "feet", "hands", "off_hand", "pouch", "neck", "earrings", "ring", "back"].forEach((type) => {
            let equipmentSelect = document.getElementById("selectEquipment_" + type);
            let enhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_" + type);
            let currentEquipment = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/" + type);
            if (currentEquipment !== undefined) {
                equipmentSelect.value = currentEquipment.itemHrid;
                enhancementLevelInput.value = currentEquipment.enhancementLevel;
            } else {
                equipmentSelect.value = "";
                enhancementLevelInput.value = 0;
            }
        });

        let weaponSelect = document.getElementById("selectEquipment_weapon");
        let weaponEnhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_weapon");
        let mainhandWeapon = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/main_hand");
        let twohandWeapon = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/two_hand");
        if (mainhandWeapon !== undefined) {
            weaponSelect.value = mainhandWeapon.itemHrid;
            weaponEnhancementLevelInput.value = mainhandWeapon.enhancementLevel;
        } else if (twohandWeapon !== undefined) {
            weaponSelect.value = twohandWeapon.itemHrid;
            weaponEnhancementLevelInput.value = twohandWeapon.enhancementLevel;
        } else {
            weaponSelect.value = "";
            weaponEnhancementLevelInput.value = 0;
        }
        importSet.drinks = importSet.drinks["/action_types/combat"];
        importSet.food = importSet.food["/action_types/combat"];
        for (let i = 0; i < 3; i++) {
            let drinkSelect = document.getElementById("selectDrink_" + i);
            let foodSelect = document.getElementById("selectFood_" + i);
            if (importSet.drinks[i] != null) {
                drinkSelect.value = importSet.drinks[i].itemHrid;
            } else {
                drinkSelect.value = "";
            }
            if (importSet.food[i] != null) {
                foodSelect.value = importSet.food[i].itemHrid;
            } else {
                foodSelect.value = "";
            }
        }

        let hasSpecial = false;
        if (importSet.abilities && Object.keys(importSet.abilities).length == 5) {
            hasSpecial = true;
        }

        for (let i = 0; i < (hasSpecial ? 5 : 4); i++) {
            let abilitySlot = hasSpecial ? i : (i + 1);
            let abilitySelect = document.getElementById("selectAbility_" + abilitySlot);
            let abilityLevelInput = document.getElementById("inputAbilityLevel_" + abilitySlot);
            if (importSet.abilities[i] != null) {
                abilitySelect.value = importSet.abilities[i].abilityHrid;
                abilityLevelInput.value = String(importSet.abilities[i].level);
            } else {
                abilitySelect.value = "";
                abilityLevelInput.value = "1";
            }
        }

        if (importSet.triggerMap) {
            triggerMap = importSet.triggerMap;
        }

        if (importSet.houseRooms) {
            for (const room in importSet.houseRooms) {
                const field = document.querySelector('[data-house-hrid="' + room + '"]');
                if (importSet.houseRooms[room]) {
                    field.value = importSet.houseRooms[room];
                } else {
                    field.value = '';
                }
            }
            player.houseRooms = importSet.houseRooms;
        } else {
            let houseRooms = Object.values(houseRoomDetailMap);
            for (const room of Object.values(houseRooms)) {
                const field = document.querySelector('[data-house-hrid="' + room.hrid + '"]');
                field.value = '';
                player.houseRooms[room.hrid] = 0;
            }
        }

        let zoneSelect = document.getElementById("selectZone");
        zoneSelect.value = importSet["zone"];
        let simulationDuration = document.getElementById("inputSimulationTime");
        simulationDuration.value = importSet["simulationTime"];
        updateState();
        updateUI();
    });
}

function showErrorModal(error) {
    let zoneSelect = document.getElementById("selectZone");
    let simulationTimeInput = document.getElementById("inputSimulationTime");

    let state = {
        error: error,
        player: player,
        food: food,
        drinks: drinks,
        abilities: abilities,
        triggerMap: triggerMap,
        modalTriggers: modalTriggers,
        zone: zoneSelect.value,
        simulationTime: simulationTimeInput.value,
    };

    for (let i = 0; i < 5; i++) {
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
        state["abilityLevel" + i] = abilityLevelInput.value;
    }

    let errorInput = document.getElementById("inputError");
    errorInput.value = JSON.stringify(state);

    let errorModal = new bootstrap.Modal(document.getElementById("errorModal"));
    errorModal.show();
}

window.prices;

async function fetchPrices() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/holychikenz/MWIApi/main/milkyapi.json');
        if (!response.ok) {
            throw new Error('Error fetching prices');
        }
        const pricesJson = await response.json();
        window.prices = pricesJson['market'];
        window.prices["Coin"]["bid"] = 1;
        window.prices["Coin"]["ask"] = 1;
        window.prices["Coin"]["vendor"] = 1;
    } catch (error) {
        console.error(error);
    }
}

document.getElementById("buttonGetPrices").onclick = async () => {
    await fetchPrices();
};

document.addEventListener("input", (e) => {
    let element = e.target;
    if (element.tagName == "TD" && element.parentNode.parentNode.parentNode.classList.value.includes('profit-table')) {
        let tableId = element.parentNode.parentNode.parentNode.id;
        let row = element.parentNode.querySelectorAll('td');
        let item = row[0].innerText;
        let newPrice = element.innerText;

        let revenueSetting = document.getElementById('selectPrices_drops').value;
        let expensesSetting = document.getElementById('selectPrices_consumables').value;

        let expensesDifference = 0;
        let revenueDifference = 0;
        let noRngRevenueDifference = 0;

        if (tableId == 'expensesTable') {
            expensesDifference = updateTable('expensesTable', item, newPrice);
            if (revenueSetting == expensesSetting) {
                revenueDifference = updateTable('revenueTable', item, newPrice);
                noRngRevenueDifference = updateTable('noRngRevenueTable', item, newPrice);
            }
            if (window.prices) {
                if (expensesSetting == 'bid') {
                    window.prices[item]['bid'] = newPrice;
                } else {
                    window.prices[item]['ask'] = newPrice;
                }
            }
        } else {
            revenueDifference = updateTable('revenueTable', item, newPrice);
            noRngRevenueDifference = updateTable('noRngRevenueTable', item, newPrice);
            if (revenueSetting == expensesSetting) {
                expensesDifference = updateTable('expensesTable', item, newPrice);
            }
            if (window.prices) {
                if (revenueSetting == 'bid') {
                    window.prices[item]['bid'] = newPrice;
                } else {
                    window.prices[item]['ask'] = newPrice;
                }
            }
        }

        window.expenses += expensesDifference;
        document.getElementById('expensesSpan').innerText = window.expenses.toLocaleString();
        window.revenue += revenueDifference;
        document.getElementById('revenueSpan').innerText = window.revenue.toLocaleString();
        window.noRngRevenue += noRngRevenueDifference;
        document.getElementById('noRngRevenueSpan').innerText = window.noRngRevenue.toLocaleString();

        window.profit = window.revenue - window.expenses;
        document.getElementById('profitPreview').innerText = window.profit.toLocaleString();
        document.getElementById('profitSpan').innerText = window.profit.toLocaleString();
        window.noRngProfit = window.noRngRevenue - window.expenses;
        document.getElementById('noRngProfitSpan').innerText = window.noRngProfit.toLocaleString();
        document.getElementById('noRngProfitPreview').innerText = window.noRngProfit.toLocaleString();
    }
});

function updateTable(tableId, item, price) {
    let row = document.querySelector('#' + tableId + ' .' + item.replace(/\s+/g, ''));
    if (row == null) {
        return 0;
    }

    row = row.querySelectorAll('td');
    let priceTd = row[1];
    let amountTd = row[2];
    let totalTd = row[3];
    let oldTotal = totalTd.innerText;
    let newTotal = price * amountTd.innerText;

    if (priceTd.innerText != price) {
        priceTd.innerText = price;
    }
    totalTd.innerText = newTotal;

    return newTotal - oldTotal;
}

// #endregion

function updateState() {
    updateEquipmentState();
    updateLevels();
    updateFoodState();
    updateDrinksState();
    updateAbilityState();
}

function updateUI() {
    updateCombatStatsUI();
    updateFoodUI();
    updateDrinksUI();
    updateAbilityUI();
}

const darkModeToggle = document.getElementById('darkModeToggle');
const body = document.body;

if (localStorage.getItem('darkModeEnabled') === 'true') {
    body.classList.add('dark-mode');
    darkModeToggle.checked = true;
}

darkModeToggle.addEventListener('change', () => {
    body.classList.toggle('dark-mode');
    localStorage.setItem('darkModeEnabled', darkModeToggle.checked);
});

initEquipmentSection();
initHouseRoomsModal();
initLevelSection();
initFoodSection();
initDrinksSection();
initAbilitiesSection();
initZones();
initTriggerModal();
initSimulationControls();
initAllZonesSimulationControls();
initEquipmentSetsModal();
initErrorHandling();
initImportExportModal();

updateState();
updateUI();
