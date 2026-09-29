// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IVoltGridHouseRegistry {
    function houses(address account) external view returns (
        bool exists,
        bool hasSolar,
        bool hasBattery,
        uint32 batteryCapacityWh,
        bool batteryOptedIn,
        uint32 registrationIndex
    );
}

/// @title HouseScreeningDemoCertificate
/// @notice Testnet-only demo record that a connected wallet completed local bill OCR phrase screening.
/// @dev This token is explicitly not an official government or DISCOM verification credential.
contract HouseScreeningDemoCertificate is ERC721 {
    using Strings for uint256;

    uint8 public constant SOLAR_SIGNAL = 1;
    uint8 public constant EXPORT_SIGNAL = 2;
    uint8 public constant NET_UNITS_SIGNAL = 4;

    struct ScreeningData {
        bytes32 documentCommitment;
        uint8 signalFlags;
        uint64 issuedAt;
    }

    IVoltGridHouseRegistry public immutable market;
    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => ScreeningData) private _screenings;
    mapping(address account => uint256 tokenId) public credentialTokenOf;

    event HouseScreeningDemoMinted(
        address indexed account,
        uint256 indexed tokenId,
        bytes32 indexed documentCommitment,
        uint8 signalFlags
    );

    error ZeroAddress();
    error InvalidMarket();
    error HouseNotRegistered();
    error SolarNotDeclared();
    error InvalidScreeningData();
    error CredentialAlreadyIssued(uint256 tokenId);
    error NonTransferableDemoCredential();

    constructor(address market_) ERC721("VoltGrid House Screening Demo (Testnet)", "VGHS-DEMO") {
        if (market_ == address(0)) revert ZeroAddress();
        if (market_.code.length == 0) revert InvalidMarket();
        market = IVoltGridHouseRegistry(market_);
    }

    /// @notice Mints an explicitly non-official demonstration token to the caller's registered solar house wallet.
    /// @dev The contract cannot validate browser OCR or the source document; flags and commitment are caller supplied.
    function mintDemoScreening(bytes32 documentCommitment, uint8 signalFlags) external returns (uint256 tokenId) {
        if (documentCommitment == bytes32(0) || (signalFlags & 0xf8) != 0 || signalFlags == 0) {
            revert InvalidScreeningData();
        }
        (bool exists, bool hasSolar,,,,) = market.houses(msg.sender);
        if (!exists) revert HouseNotRegistered();
        if (!hasSolar) revert SolarNotDeclared();
        uint256 existingTokenId = credentialTokenOf[msg.sender];
        if (existingTokenId != 0) revert CredentialAlreadyIssued(existingTokenId);

        tokenId = nextTokenId++;
        credentialTokenOf[msg.sender] = tokenId;
        _screenings[tokenId] = ScreeningData({
            documentCommitment: documentCommitment,
            signalFlags: signalFlags,
            issuedAt: uint64(block.timestamp)
        });
        _mint(msg.sender, tokenId);
        emit HouseScreeningDemoMinted(msg.sender, tokenId, documentCommitment, signalFlags);
    }

    function screeningData(uint256 tokenId) external view returns (ScreeningData memory) {
        _requireMinted(tokenId);
        return _screenings[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        ScreeningData memory screening = _screenings[tokenId];
        string memory commitment = Strings.toHexString(uint256(screening.documentCommitment), 32);
        string memory json = string(abi.encodePacked(
            "{\"name\":\"VoltGrid House Screening Demo #", tokenId.toString(),
            "\",\"description\":\"MST TESTNET DEMO ONLY. Records a wallet-submitted commitment and client-side electricity-bill OCR phrase flags. It is not an official government, DISCOM, identity, property, installation, or ownership verification.\",",
            "\"attributes\":[",
            "{\"trait_type\":\"network\",\"value\":\"MST testnet demo\"},",
            "{\"trait_type\":\"documentCommitment\",\"value\":\"", commitment, "\"},",
            "{\"trait_type\":\"clientOcrSignalFlags\",\"value\":", uint256(screening.signalFlags).toString(), "},",
            "{\"trait_type\":\"issuedAt\",\"value\":", uint256(screening.issuedAt).toString(), "},",
            "{\"trait_type\":\"officialVerification\",\"value\":false}]}"
        ));
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert NonTransferableDemoCredential();
        return super._update(to, tokenId, auth);
    }

    function _requireMinted(uint256 tokenId) private view {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
    }
}
