// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICarbonCertificate {
    function market() external view returns (address);
    function mint(
        address solarSeller,
        bytes32 dayId,
        uint32 eligibleWh,
        uint32 factorGPerKwh,
        uint32 factorVersion
    ) external returns (uint256 tokenId);
}

/// @title VoltGridMarket
/// @notice Integer-Wh settlement ledger for the simulated VoltGrid market.
///
/// The market never treats unsolicited ERC-20 transfers as deposits. Its
/// internal balances are the accounting source of truth and must be funded by
/// an explicit deposit/funding call. This keeps every settlement transition
/// auditable and makes the simulated DISCOM treasury explicit.
contract VoltGridMarket is AccessControl, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant SEEDER_ROLE = keccak256("SEEDER_ROLE");
    bytes32 public constant GRID_OPERATOR_ROLE = keccak256("GRID_OPERATOR_ROLE");

    uint32 public constant MAX_HOUSES = 16;
    uint32 public constant MAX_READING_WH = 100_000;
    uint32 public constant MAX_EMERGENCY_DISCHARGE_PER_EPOCH_WH = 100_000;
    uint32 public constant MAX_EMERGENCY_TARGET_WH = 1_600_000;
    uint256 public constant WEI_PER_MICRO_VLT_WH = 1_000_000_000;

    // Immutable model assumptions from the frozen interface.
    uint64 public constant FEED_IN_MICRO = 2_500_000;
    uint64 public constant RETAIL_MICRO = 8_000_000;

    uint64 public constant MIN_PRICE_MICRO = 3_000_000;
    uint64 public constant MAX_PRICE_MICRO = 7_000_000;
    uint64 public constant MAX_FEE_MICRO = 420_000;
    uint64 public constant MIN_EMERGENCY_TARIFF_MICRO = 2_500_000;
    uint64 public constant MAX_EMERGENCY_TARIFF_MICRO = 8_000_000;

    struct Reading {
        address house;
        uint32 generationWh;
        uint32 consumptionWh;
    }

    struct Discharge {
        address house;
        uint32 deliveredWh;
    }

    struct House {
        bool exists;
        bool hasSolar;
        bool hasBattery;
        uint32 batteryCapacityWh;
        bool batteryOptedIn;
        uint32 registrationIndex;
    }

    struct Day {
        bool active;
        bytes32 id;
        bytes32 inputDigest;
        uint32 modelVersion;
        uint8 nextEpoch;
        uint64 floorMicro;
        uint64 baseMicro;
        uint64 capMicro;
        uint64 feeMicro;
        bool emergencyActive;
        bool emergencyReported;
        uint32 emergencyTargetWh;
        uint64 emergencyTariffMicro;
        uint32 emergencyDeliveredWh;
        uint256 emergencyPayoutWei;
        uint32 carbonFactorGPerKwh;
        uint32 carbonFactorVersion;
    }

    struct SettlementData {
        uint256[] surplus;
        uint256[] deficit;
        uint256[] sellerQuotas;
        uint256[] buyerQuotas;
        uint256 matched;
        uint64 priceMicro;
    }

    IERC20 public immutable settlementToken;
    address public immutable treasury;

    mapping(address => uint256) public internalBalance;
    mapping(address => House) public houses;
    address[] private _houseList;
    mapping(bytes32 => bool) public usedDayIds;
    mapping(bytes32 => mapping(address => uint32)) public emergencyDeliveredByHouse;
    /// @notice Matched P2P Wh attributed only to each solar seller, by day.
    mapping(bytes32 => mapping(address => uint32)) public eligibleWh;
    mapping(bytes32 => mapping(address => bool)) public certificateMintedForDay;
    Day public currentDay;
    ICarbonCertificate public carbonCertificate;
    uint32 public carbonFactorGPerKwh = 700;
    uint32 public carbonFactorVersion = 1;

    event HouseRegistered(
        address indexed house,
        bool hasSolar,
        bool hasBattery,
        uint32 batteryCapacityWh
    );
    event Deposited(address indexed payer, address indexed house, uint256 amountWei);
    event Withdrawn(address indexed house, uint256 amountWei);
    event TreasuryFunded(address indexed payer, uint256 amountWei);
    event TreasuryWithdrawn(address indexed treasury, uint256 amountWei);
    event BatteryOptInChanged(address indexed house, bool optedIn);
    event PricingParamsChanged(uint64 floorMicro, uint64 baseMicro, uint64 capMicro, uint64 feeMicro);
    event DayStarted(bytes32 indexed dayId, bytes32 inputDigest, uint32 modelVersion);
    event TradeSettled(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        address indexed seller,
        address buyer,
        uint32 wh,
        uint64 priceMicro,
        uint256 grossWei,
        uint256 feeWei
    );
    event GridExportSettled(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        address indexed seller,
        uint32 wh,
        uint256 amountWei
    );
    event GridImportSettled(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        address indexed buyer,
        uint32 wh,
        uint256 amountWei
    );
    event EpochSettled(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        uint64 priceMicro,
        uint32 matchedWh,
        uint32 exportedWh,
        uint32 importedWh,
        uint256 feesWei
    );
    event EmergencyDeclared(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        uint32 targetWh,
        uint64 tariffMicro
    );
    event BatteryDischarged(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        address indexed house,
        uint32 deliveredWh,
        uint256 payoutWei
    );
    event EmergencyReportRecorded(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        uint32 deliveredWh,
        uint256 payoutWei,
        uint8 dischargeCount
    );
    event EmergencyResolved(
        bytes32 indexed dayId,
        uint8 indexed epochIndex,
        uint32 targetWh,
        uint32 shavedWh,
        uint256 payoutWei
    );
    event DayClosed(bytes32 indexed dayId);
    event CarbonFactorChanged(uint32 factorGPerKwh, uint32 factorVersion);
    event CarbonFactorApplied(bytes32 indexed dayId, uint32 factorGPerKwh, uint32 factorVersion);
    event CertificateMinted(
        bytes32 indexed dayId,
        address indexed solarSeller,
        uint256 indexed tokenId,
        uint32 eligibleWh,
        uint32 factorGPerKwh,
        uint256 avoidedMgCo2e
    );

    error ZeroAddress();
    error InvalidAmount();
    error HouseAlreadyRegistered(address house);
    error HouseNotRegistered(address house);
    error HouseLimitReached();
    error RegistrationFrozen();
    error InvalidBatteryConfiguration();
    error TreasuryCannotBeHouse();
    error InvalidPricingParams();
    error DayAlreadyActive();
    error NoActiveDay();
    error InvalidDay(bytes32 expected, bytes32 supplied);
    error DayIdAlreadyUsed(bytes32 dayId);
    error InvalidEpoch(uint8 expected, uint8 supplied);
    error InvalidReadingOrder(uint256 index, address expected, address supplied);
    error InvalidReadingValue(address house);
    error EmergencyInProgress();
    error NoEmergency();
    error EmergencyAlreadyReported();
    error EmergencyNotReported();
    error InvalidEmergencyTarget();
    error InvalidEmergencyTariff();
    error BatteryNotEligible(address house);
    error DuplicateDischarge(address house);
    error DischargeExceedsCapacity(address house);
    error DischargeExceedsTarget();
    error InsufficientInternalBalance(address account, uint256 available, uint256 required);
    error DayNotComplete();
    error DayAlreadyClosed(bytes32 dayId);
    error CarbonCertificateNotConfigured();
    error InvalidCarbonCertificate();
    error InvalidCarbonFactor();
    error CertificateAlreadyMinted(bytes32 dayId, address seller);

    constructor(address settlementToken_, address treasury_)
        Ownable(msg.sender)
    {
        if (settlementToken_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        settlementToken = IERC20(settlementToken_);
        treasury = treasury_;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
        _grantRole(REGISTRAR_ROLE, msg.sender);
        _grantRole(SEEDER_ROLE, msg.sender);
        _grantRole(GRID_OPERATOR_ROLE, msg.sender);
    }

    function registerHouse(bool hasSolar, bool hasBattery, uint32 batteryCapacityWh) external {
        _registerHouse(msg.sender, hasSolar, hasBattery, batteryCapacityWh);
    }

    function registerHouseFor(
        address house,
        bool hasSolar,
        bool hasBattery,
        uint32 batteryCapacityWh
    ) external onlyRole(REGISTRAR_ROLE) {
        _registerHouse(house, hasSolar, hasBattery, batteryCapacityWh);
    }

    function deposit(uint256 amountWei) external nonReentrant {
        _requireRegistered(msg.sender);
        _depositFrom(msg.sender, msg.sender, amountWei);
    }

    function depositFor(address house, uint256 amountWei)
        external
        onlyRole(SEEDER_ROLE)
        nonReentrant
    {
        _requireRegistered(house);
        _depositFrom(msg.sender, house, amountWei);
    }

    function fundTreasury(uint256 amountWei) external nonReentrant {
        if (amountWei == 0) revert InvalidAmount();
        settlementToken.safeTransferFrom(msg.sender, address(this), amountWei);
        internalBalance[treasury] += amountWei;
        emit TreasuryFunded(msg.sender, amountWei);
    }

    function withdraw(uint256 amountWei) external nonReentrant {
        _requireRegistered(msg.sender);
        _debit(msg.sender, amountWei);
        settlementToken.safeTransfer(msg.sender, amountWei);
        emit Withdrawn(msg.sender, amountWei);
    }

    function withdrawTreasury(uint256 amountWei) external nonReentrant {
        if (msg.sender != treasury) revert UnauthorizedTreasury(msg.sender);
        _debit(treasury, amountWei);
        settlementToken.safeTransfer(treasury, amountWei);
        emit TreasuryWithdrawn(treasury, amountWei);
    }

    function setBatteryOptIn(bool optedIn) external {
        if (currentDay.active) revert RegistrationFrozen();
        House storage house = _requireRegistered(msg.sender);
        if (!house.hasBattery && optedIn) revert InvalidBatteryConfiguration();
        house.batteryOptedIn = optedIn;
        emit BatteryOptInChanged(msg.sender, optedIn);
    }

    function setPricingParams(
        uint64 floorMicro,
        uint64 baseMicro,
        uint64 capMicro,
        uint64 feeMicro
    ) external onlyOwner {
        if (currentDay.active) revert RegistrationFrozen();
        _validatePricing(floorMicro, baseMicro, capMicro, feeMicro);
        emit PricingParamsChanged(floorMicro, baseMicro, capMicro, feeMicro);
        // Store these as the parameters for the next day. The current-day
        // snapshot is copied by startDay and is never changed mid-day.
        pricingFloorMicro = floorMicro;
        pricingBaseMicro = baseMicro;
        pricingCapMicro = capMicro;
        wheelingFeeMicro = feeMicro;
    }

    /// @notice Bind the ERC-721 once before any day starts; it must point back to this market.
    function setCarbonCertificate(address certificate) external onlyOwner {
        if (currentDay.active) revert RegistrationFrozen();
        if (address(carbonCertificate) != address(0)) revert InvalidCarbonCertificate();
        if (certificate == address(0) || certificate.code.length == 0) revert InvalidCarbonCertificate();
        try ICarbonCertificate(certificate).market() returns (address boundMarket) {
            if (boundMarket != address(this)) revert InvalidCarbonCertificate();
        } catch {
            revert InvalidCarbonCertificate();
        }
        carbonCertificate = ICarbonCertificate(certificate);
    }

    /// @notice Set a future-day model factor; this is not a verified emissions baseline.
    function setCarbonFactor(uint32 factorGPerKwh, uint32 factorVersion_) external onlyOwner {
        if (currentDay.active) revert RegistrationFrozen();
        if (factorGPerKwh == 0 || factorGPerKwh > 2_000 || factorVersion_ <= carbonFactorVersion) {
            revert InvalidCarbonFactor();
        }
        carbonFactorGPerKwh = factorGPerKwh;
        carbonFactorVersion = factorVersion_;
        emit CarbonFactorChanged(factorGPerKwh, factorVersion_);
    }

    function startDay(bytes32 dayId, bytes32 inputDigest, uint32 modelVersion)
        external
        onlyRole(ORACLE_ROLE)
    {
        if (currentDay.active) revert DayAlreadyActive();
        if (dayId == bytes32(0)) revert InvalidDay(bytes32(0), dayId);
        if (usedDayIds[dayId]) revert DayIdAlreadyUsed(dayId);
        if (_houseList.length == 0) revert HouseLimitReached();
        if (address(carbonCertificate) == address(0)) revert CarbonCertificateNotConfigured();

        usedDayIds[dayId] = true;
        currentDay = Day({
            active: true,
            id: dayId,
            inputDigest: inputDigest,
            modelVersion: modelVersion,
            nextEpoch: 0,
            floorMicro: pricingFloorMicro,
            baseMicro: pricingBaseMicro,
            capMicro: pricingCapMicro,
            feeMicro: wheelingFeeMicro,
            emergencyActive: false,
            emergencyReported: false,
            emergencyTargetWh: 0,
            emergencyTariffMicro: 0,
            emergencyDeliveredWh: 0,
            emergencyPayoutWei: 0,
            carbonFactorGPerKwh: carbonFactorGPerKwh,
            carbonFactorVersion: carbonFactorVersion
        });
        emit DayStarted(dayId, inputDigest, modelVersion);
    }

    function settleEpoch(bytes32 dayId, uint8 epochIndex, Reading[] calldata readings)
        external
        onlyRole(ORACLE_ROLE)
    {
        Day storage day = _requireOpenEpoch(dayId, epochIndex);
        SettlementData memory data = _prepareSettlement(day, readings);

        uint256 feesWei = _settleMatched(
            dayId,
            epochIndex,
            data.priceMicro,
            data.sellerQuotas,
            data.buyerQuotas
        );

        (uint256 exported, uint256 imported) = _settleUnmatched(
            dayId,
            epochIndex,
            data.surplus,
            data.deficit,
            data.sellerQuotas,
            data.buyerQuotas
        );

        day.nextEpoch = epochIndex + 1;
        emit EpochSettled(
            dayId,
            epochIndex,
            data.priceMicro,
            _asUint32(data.matched),
            _asUint32(exported),
            _asUint32(imported),
            feesWei
        );
    }

    function declareEmergency(
        bytes32 dayId,
        uint8 epochIndex,
        uint32 targetWh,
        uint64 tariffMicro
    ) external onlyRole(GRID_OPERATOR_ROLE) {
        Day storage day = _requireOpenEpoch(dayId, epochIndex);
        if (day.emergencyActive) revert EmergencyInProgress();
        if (targetWh == 0 || targetWh > MAX_EMERGENCY_TARGET_WH) {
            revert InvalidEmergencyTarget();
        }
        if (
            tariffMicro < MIN_EMERGENCY_TARIFF_MICRO ||
            tariffMicro > MAX_EMERGENCY_TARIFF_MICRO
        ) revert InvalidEmergencyTariff();

        day.emergencyActive = true;
        day.emergencyReported = false;
        day.emergencyTargetWh = targetWh;
        day.emergencyTariffMicro = tariffMicro;
        day.emergencyDeliveredWh = 0;
        day.emergencyPayoutWei = 0;
        emit EmergencyDeclared(dayId, epochIndex, targetWh, tariffMicro);
    }

    function reportDischarge(bytes32 dayId, uint8 epochIndex, Discharge[] calldata discharges)
        external
        onlyRole(ORACLE_ROLE)
    {
        Day storage day = _requireEpoch(dayId, epochIndex);
        if (!day.emergencyActive) revert NoEmergency();
        if (day.emergencyReported) revert EmergencyAlreadyReported();
        if (discharges.length > MAX_HOUSES) revert InvalidAmount();

        uint256 totalNewWh;
        uint256 payoutWei;
        for (uint256 i; i < discharges.length; ++i) {
            Discharge calldata discharge = discharges[i];
            House storage house = houses[discharge.house];
            if (!house.exists || !house.hasBattery || !house.batteryOptedIn) {
                revert BatteryNotEligible(discharge.house);
            }
            if (discharge.deliveredWh == 0) revert InvalidAmount();
            if (discharge.deliveredWh > MAX_EMERGENCY_DISCHARGE_PER_EPOCH_WH) {
                revert DischargeExceedsCapacity(discharge.house);
            }
            for (uint256 j; j < i; ++j) {
                if (discharges[j].house == discharge.house) {
                    revert DuplicateDischarge(discharge.house);
                }
            }

            uint256 cumulative = uint256(emergencyDeliveredByHouse[dayId][discharge.house]) +
                discharge.deliveredWh;
            if (cumulative > house.batteryCapacityWh) {
                revert DischargeExceedsCapacity(discharge.house);
            }
            if (uint256(day.emergencyDeliveredWh) + totalNewWh + discharge.deliveredWh > day.emergencyTargetWh) {
                revert DischargeExceedsTarget();
            }

            uint256 itemPayoutWei = _energyAmount(discharge.deliveredWh, day.emergencyTariffMicro);
            payoutWei += itemPayoutWei;
            totalNewWh += discharge.deliveredWh;
        }

        if (payoutWei != 0) _debit(treasury, payoutWei);
        for (uint256 i; i < discharges.length; ++i) {
            Discharge calldata discharge = discharges[i];
            emergencyDeliveredByHouse[dayId][discharge.house] += discharge.deliveredWh;
            internalBalance[discharge.house] += _energyAmount(
                discharge.deliveredWh,
                day.emergencyTariffMicro
            );
            emit BatteryDischarged(
                dayId,
                epochIndex,
                discharge.house,
                discharge.deliveredWh,
                _energyAmount(discharge.deliveredWh, day.emergencyTariffMicro)
            );
        }

        day.emergencyDeliveredWh += _asUint32(totalNewWh);
        day.emergencyPayoutWei += payoutWei;
        day.emergencyReported = true;
        emit EmergencyReportRecorded(
            dayId,
            epochIndex,
            _asUint32(totalNewWh),
            payoutWei,
            uint8(discharges.length)
        );
    }

    function resolveEmergency(bytes32 dayId, uint8 epochIndex)
        external
        onlyRole(GRID_OPERATOR_ROLE)
    {
        Day storage day = _requireEpoch(dayId, epochIndex);
        if (!day.emergencyActive) revert NoEmergency();
        if (!day.emergencyReported) revert EmergencyNotReported();

        uint32 targetWh = day.emergencyTargetWh;
        uint32 shavedWh = day.emergencyDeliveredWh;
        uint256 payoutWei = day.emergencyPayoutWei;
        day.emergencyActive = false;
        day.emergencyReported = false;
        day.emergencyTargetWh = 0;
        day.emergencyTariffMicro = 0;
        day.emergencyDeliveredWh = 0;
        day.emergencyPayoutWei = 0;
        day.nextEpoch = epochIndex + 1;

        emit EmergencyResolved(dayId, epochIndex, targetWh, shavedWh, payoutWei);
    }

    function closeDay(bytes32 dayId) external onlyRole(ORACLE_ROLE) {
        Day storage day = currentDay;
        if (!day.active) revert NoActiveDay();
        if (day.id != dayId) revert InvalidDay(day.id, dayId);
        if (day.nextEpoch != 24 || day.emergencyActive) revert DayNotComplete();

        emit CarbonFactorApplied(dayId, day.carbonFactorGPerKwh, day.carbonFactorVersion);
        for (uint256 i; i < _houseList.length; ++i) {
            address seller = _houseList[i];
            uint32 amountWh = eligibleWh[dayId][seller];
            if (amountWh == 0) continue;
            if (certificateMintedForDay[dayId][seller]) revert CertificateAlreadyMinted(dayId, seller);
            certificateMintedForDay[dayId][seller] = true;
            uint256 tokenId = carbonCertificate.mint(
                seller,
                dayId,
                amountWh,
                day.carbonFactorGPerKwh,
                day.carbonFactorVersion
            );
            emit CertificateMinted(
                dayId,
                seller,
                tokenId,
                amountWh,
                day.carbonFactorGPerKwh,
                uint256(amountWh) * day.carbonFactorGPerKwh
            );
        }
        day.active = false;
        emit DayClosed(dayId);
    }

    /// @notice Preview the current parameter set's integer price curve.
    ///         A zero match has no settled P2P price and returns zero.
    function previewPrice(uint256 totalSurplusWh, uint256 totalDeficitWh)
        external
        view
        returns (uint64)
    {
        uint256 matched = totalSurplusWh < totalDeficitWh ? totalSurplusWh : totalDeficitWh;
        return _priceForCurrent(totalSurplusWh, totalDeficitWh, matched);
    }

    function houseCount() external view returns (uint256) {
        return _houseList.length;
    }

    function getHouses() external view returns (address[] memory) {
        return _houseList;
    }

    function totalInternalBalance() public view returns (uint256 total) {
        total = internalBalance[treasury];
        for (uint256 i; i < _houseList.length; ++i) {
            total += internalBalance[_houseList[i]];
        }
    }

    uint64 public pricingFloorMicro = MIN_PRICE_MICRO;
    uint64 public pricingBaseMicro = 5_000_000;
    uint64 public pricingCapMicro = MAX_PRICE_MICRO;
    uint64 public wheelingFeeMicro = MAX_FEE_MICRO;

    function _registerHouse(
        address house,
        bool hasSolar,
        bool hasBattery,
        uint32 batteryCapacityWh
    ) internal {
        if (currentDay.active) revert RegistrationFrozen();
        if (house == address(0)) revert ZeroAddress();
        if (house == treasury) revert TreasuryCannotBeHouse();
        if (houses[house].exists) revert HouseAlreadyRegistered(house);
        if (_houseList.length >= MAX_HOUSES) revert HouseLimitReached();
        if ((!hasBattery && batteryCapacityWh != 0) || (hasBattery && batteryCapacityWh == 0)) {
            revert InvalidBatteryConfiguration();
        }
        if (batteryCapacityWh > MAX_READING_WH) revert InvalidBatteryConfiguration();

        uint32 index = uint32(_houseList.length);
        houses[house] = House({
            exists: true,
            hasSolar: hasSolar,
            hasBattery: hasBattery,
            batteryCapacityWh: batteryCapacityWh,
            batteryOptedIn: false,
            registrationIndex: index
        });
        _houseList.push(house);
        emit HouseRegistered(house, hasSolar, hasBattery, batteryCapacityWh);
    }

    function _depositFrom(address payer, address house, uint256 amountWei) internal {
        if (amountWei == 0) revert InvalidAmount();
        // The payer, never the target house, is the allowance owner.
        settlementToken.safeTransferFrom(payer, address(this), amountWei);
        internalBalance[house] += amountWei;
        emit Deposited(payer, house, amountWei);
    }

    function _requireRegistered(address house) internal view returns (House storage) {
        if (!houses[house].exists) revert HouseNotRegistered(house);
        return houses[house];
    }

    function _requireOpenEpoch(bytes32 dayId, uint8 epochIndex)
        internal
        view
        returns (Day storage day)
    {
        day = _requireEpoch(dayId, epochIndex);
        if (day.emergencyActive) revert EmergencyInProgress();
    }

    function _requireEpoch(bytes32 dayId, uint8 epochIndex)
        internal
        view
        returns (Day storage day)
    {
        day = currentDay;
        if (!day.active) revert NoActiveDay();
        if (day.id != dayId) revert InvalidDay(day.id, dayId);
        if (day.nextEpoch != epochIndex) revert InvalidEpoch(day.nextEpoch, epochIndex);
    }

    function _debit(address account, uint256 amountWei) internal {
        if (amountWei == 0) revert InvalidAmount();
        uint256 available = internalBalance[account];
        if (available < amountWei) {
            revert InsufficientInternalBalance(account, available, amountWei);
        }
        unchecked {
            internalBalance[account] = available - amountWei;
        }
    }

    function _settleMatched(
        bytes32 dayId,
        uint8 epochIndex,
        uint64 priceMicro,
        uint256[] memory sellerQuotas,
        uint256[] memory buyerQuotas
    ) internal returns (uint256 feesWei) {
        // Keep the original Hamilton quotas intact for the unmatched export /
        // import calculation. These working copies are consumed by pairing.
        uint256[] memory sellerRemaining = _copyArray(sellerQuotas);
        uint256[] memory buyerRemaining = _copyArray(buyerQuotas);
        uint256 sellerIndex;
        uint256 buyerIndex;
        while (sellerIndex < sellerRemaining.length && buyerIndex < buyerRemaining.length) {
            while (sellerIndex < sellerRemaining.length && sellerRemaining[sellerIndex] == 0) ++sellerIndex;
            while (buyerIndex < buyerRemaining.length && buyerRemaining[buyerIndex] == 0) ++buyerIndex;
            if (sellerIndex == sellerRemaining.length || buyerIndex == buyerRemaining.length) break;

            uint256 wh = sellerRemaining[sellerIndex] < buyerRemaining[buyerIndex]
                ? sellerRemaining[sellerIndex]
                : buyerRemaining[buyerIndex];
            feesWei += _settleTrade(
                dayId,
                epochIndex,
                priceMicro,
                _houseList[sellerIndex],
                _houseList[buyerIndex],
                _asUint32(wh)
            );
            sellerRemaining[sellerIndex] -= wh;
            buyerRemaining[buyerIndex] -= wh;
        }
    }

    function _copyArray(uint256[] memory source) internal pure returns (uint256[] memory copy) {
        copy = new uint256[](source.length);
        for (uint256 i; i < source.length; ++i) copy[i] = source[i];
    }

    function _settleTrade(
        bytes32 dayId,
        uint8 epochIndex,
        uint64 priceMicro,
        address seller,
        address buyer,
        uint32 wh
    ) internal returns (uint256 feeWei) {
        uint256 grossWei = _energyAmount(wh, priceMicro);
        feeWei = _energyAmount(wh, currentDay.feeMicro);
        _debit(buyer, grossWei);
        internalBalance[seller] += grossWei - feeWei;
        internalBalance[treasury] += feeWei;
        if (!houses[seller].hasSolar) revert InvalidReadingValue(seller);
        eligibleWh[dayId][seller] = _asUint32(uint256(eligibleWh[dayId][seller]) + wh);
        emit TradeSettled(dayId, epochIndex, seller, buyer, wh, priceMicro, grossWei, feeWei);
    }

    function _settleUnmatched(
        bytes32 dayId,
        uint8 epochIndex,
        uint256[] memory surplus,
        uint256[] memory deficit,
        uint256[] memory sellerQuotas,
        uint256[] memory buyerQuotas
    ) internal returns (uint256 exported, uint256 imported) {
        for (uint256 i; i < _houseList.length; ++i) {
            uint256 exportWh = surplus[i] - sellerQuotas[i];
            if (exportWh != 0) {
                uint256 amountWei = _energyAmount(exportWh, FEED_IN_MICRO);
                _debit(treasury, amountWei);
                internalBalance[_houseList[i]] += amountWei;
                exported += exportWh;
                emit GridExportSettled(
                    dayId,
                    epochIndex,
                    _houseList[i],
                    _asUint32(exportWh),
                    amountWei
                );
            }

            uint256 importWh = deficit[i] - buyerQuotas[i];
            if (importWh != 0) {
                uint256 amountWei = _energyAmount(importWh, RETAIL_MICRO);
                _debit(_houseList[i], amountWei);
                internalBalance[treasury] += amountWei;
                imported += importWh;
                emit GridImportSettled(
                    dayId,
                    epochIndex,
                    _houseList[i],
                    _asUint32(importWh),
                    amountWei
                );
            }
        }
    }

    function _prepareSettlement(Day storage day, Reading[] calldata readings)
        internal
        view
        returns (SettlementData memory data)
    {
        uint256 count = _houseList.length;
        if (readings.length != count) revert InvalidReadingValue(address(0));

        data.surplus = new uint256[](count);
        data.deficit = new uint256[](count);
        uint256 totalSurplus;
        uint256 totalDeficit;

        for (uint256 i; i < count; ++i) {
            address expectedHouse = _houseList[i];
            Reading calldata reading = readings[i];
            if (reading.house != expectedHouse) {
                revert InvalidReadingOrder(i, expectedHouse, reading.house);
            }
            House storage house = houses[expectedHouse];
            if (reading.generationWh > MAX_READING_WH || reading.consumptionWh > MAX_READING_WH) {
                revert InvalidReadingValue(expectedHouse);
            }
            if (!house.hasSolar && reading.generationWh != 0) {
                revert InvalidReadingValue(expectedHouse);
            }

            if (reading.generationWh >= reading.consumptionWh) {
                data.surplus[i] = reading.generationWh - reading.consumptionWh;
                totalSurplus += data.surplus[i];
            } else {
                data.deficit[i] = reading.consumptionWh - reading.generationWh;
                totalDeficit += data.deficit[i];
            }
        }

        data.matched = totalSurplus < totalDeficit ? totalSurplus : totalDeficit;
        data.priceMicro = _priceFor(day, totalSurplus, totalDeficit, data.matched);
        data.sellerQuotas = _largestRemainder(data.surplus, totalSurplus, data.matched);
        data.buyerQuotas = _largestRemainder(data.deficit, totalDeficit, data.matched);
    }

    function _largestRemainder(
        uint256[] memory values,
        uint256 total,
        uint256 matched
    ) internal pure returns (uint256[] memory quotas) {
        quotas = new uint256[](values.length);
        if (total == 0 || matched == 0) return quotas;

        uint256[] memory remainders = new uint256[](values.length);
        uint256 assigned;
        for (uint256 i; i < values.length; ++i) {
            quotas[i] = matched * values[i] / total;
            remainders[i] = mulmod(matched, values[i], total);
            assigned += quotas[i];
        }

        uint256 remaining = matched - assigned;
        for (uint256 unit; unit < remaining; ++unit) {
            uint256 bestIndex = values.length;
            uint256 bestRemainder;
            for (uint256 i; i < remainders.length; ++i) {
                // Strict comparison preserves registration order on ties.
                if (remainders[i] > bestRemainder) {
                    bestRemainder = remainders[i];
                    bestIndex = i;
                }
            }
            if (bestIndex == values.length) break;
            quotas[bestIndex] += 1;
            remainders[bestIndex] = 0;
        }
    }

    function _priceFor(
        Day storage day,
        uint256 totalSurplusWh,
        uint256 totalDeficitWh,
        uint256 matched
    ) internal view returns (uint64) {
        if (matched == 0 || totalSurplusWh == 0 || totalDeficitWh == 0) return 0;
        uint256 ratioBps = totalDeficitWh * 10_000 / totalSurplusWh;
        uint256 multiplierBps = _multiplierBps(ratioBps);
        return _clampedPrice(day.floorMicro, day.baseMicro, day.capMicro, multiplierBps);
    }

    function _priceForCurrent(
        uint256 totalSurplusWh,
        uint256 totalDeficitWh,
        uint256 matched
    ) internal view returns (uint64) {
        if (matched == 0 || totalSurplusWh == 0 || totalDeficitWh == 0) return 0;
        uint256 ratioBps = totalDeficitWh * 10_000 / totalSurplusWh;
        return _clampedPrice(
            pricingFloorMicro,
            pricingBaseMicro,
            pricingCapMicro,
            _multiplierBps(ratioBps)
        );
    }

    function _multiplierBps(uint256 ratioBps) internal pure returns (uint256) {
        if (ratioBps <= 5_000) return 6_000;
        if (ratioBps <= 10_000) return 6_000 + ((ratioBps - 5_000) * 4_000 / 5_000);
        if (ratioBps <= 20_000) return 10_000 + ((ratioBps - 10_000) * 4_000 / 10_000);
        return 14_000;
    }

    function _clampedPrice(
        uint64 floorMicro,
        uint64 baseMicro,
        uint64 capMicro,
        uint256 multiplierBps
    ) internal pure returns (uint64) {
        uint256 price = uint256(baseMicro) * multiplierBps / 10_000;
        if (price < floorMicro) price = floorMicro;
        if (price > capMicro) price = capMicro;
        return uint64(price);
    }

    function _validatePricing(
        uint64 floorMicro,
        uint64 baseMicro,
        uint64 capMicro,
        uint64 feeMicro
    ) internal pure {
        if (
            floorMicro < MIN_PRICE_MICRO ||
            floorMicro > baseMicro ||
            baseMicro > capMicro ||
            capMicro > MAX_PRICE_MICRO ||
            feeMicro > MAX_FEE_MICRO ||
            uint256(FEED_IN_MICRO) + feeMicro >= floorMicro
        ) revert InvalidPricingParams();
    }

    function _energyAmount(uint256 wh, uint64 microVltPerKwh) internal pure returns (uint256) {
        return wh * uint256(microVltPerKwh) * WEI_PER_MICRO_VLT_WH;
    }

    function _asUint32(uint256 value) internal pure returns (uint32) {
        if (value > type(uint32).max) revert InvalidAmount();
        return uint32(value);
    }

    error UnauthorizedTreasury(address caller);
}
