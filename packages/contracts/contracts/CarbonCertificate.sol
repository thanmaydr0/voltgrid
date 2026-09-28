// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title CarbonCertificate
/// @notice Non-transferable-after-retirement records of simulated solar P2P allocations.
/// @dev Only the configured VoltGridMarket can mint. These records are not verified offsets.
contract CarbonCertificate is ERC721 {
    using Strings for uint256;

    struct CertificateData {
        bytes32 dayId;
        uint32 eligibleWh;
        uint32 factorGPerKwh;
        uint32 factorVersion;
        uint256 avoidedMgCo2e;
    }

    address public immutable market;
    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => CertificateData) private _certificateData;
    mapping(uint256 tokenId => bool) public retired;
    mapping(bytes32 dayId => mapping(address seller => bool)) public mintedForDay;

    event CertificateRetired(uint256 indexed tokenId, address indexed owner);

    error ZeroAddress();
    error OnlyMarket();
    error InvalidCertificateData();
    error AlreadyMinted(bytes32 dayId, address seller);
    error NotTokenOwner();
    error AlreadyRetired(uint256 tokenId);
    error RetiredTokenCannotTransfer(uint256 tokenId);

    constructor(address market_) ERC721("VoltGrid Illustrative Solar Record", "VGSR") {
        if (market_ == address(0)) revert ZeroAddress();
        market = market_;
    }

    modifier onlyMarket() {
        if (msg.sender != market) revert OnlyMarket();
        _;
    }

    function mint(
        address solarSeller,
        bytes32 dayId,
        uint32 eligibleWh,
        uint32 factorGPerKwh,
        uint32 factorVersion
    ) external onlyMarket returns (uint256 tokenId) {
        if (
            solarSeller == address(0) || dayId == bytes32(0) || eligibleWh == 0 ||
            factorGPerKwh == 0 || factorGPerKwh > 2_000 || factorVersion == 0
        ) revert InvalidCertificateData();
        if (mintedForDay[dayId][solarSeller]) revert AlreadyMinted(dayId, solarSeller);

        mintedForDay[dayId][solarSeller] = true;
        tokenId = nextTokenId++;
        _certificateData[tokenId] = CertificateData({
            dayId: dayId,
            eligibleWh: eligibleWh,
            factorGPerKwh: factorGPerKwh,
            factorVersion: factorVersion,
            avoidedMgCo2e: uint256(eligibleWh) * factorGPerKwh
        });
        // _mint deliberately avoids an onERC721Received callback in the market's
        // bounded atomic close path. The record remains an ordinary ERC-721.
        _mint(solarSeller, tokenId);
    }

    function certificateData(uint256 tokenId) external view returns (CertificateData memory) {
        _requireMinted(tokenId);
        return _certificateData[tokenId];
    }

    function retire(uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        if (tokenOwner != msg.sender) revert NotTokenOwner();
        if (retired[tokenId]) revert AlreadyRetired(tokenId);
        retired[tokenId] = true;
        emit CertificateRetired(tokenId, tokenOwner);
    }

    // SVG and JSON payload syntax requires embedded double quotes; the Solidity string literals stay single-quoted here.
    // solhint-disable quotes
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        CertificateData memory record = _certificateData[tokenId];
        string memory day = uint256(record.dayId).toHexString(32);
        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" role="img" aria-labelledby="title desc">',
            '<title id="title">VoltGrid simulated solar allocation</title>',
            '<desc id="desc">Illustrative record from confirmed local solar seller P2P allocations. Not a verified offset.</desc>',
            '<rect width="600" height="360" rx="24" fill="#102a2b"/>',
            '<text x="32" y="58" fill="#91ead0" font-family="sans-serif" font-size="22">VOLTGRID - SIMULATED ALLOCATION</text>',
            '<text x="32" y="142" fill="#ffffff" font-family="sans-serif" font-size="38">',
            uint256(record.eligibleWh).toString(), ' Wh eligible</text>',
            '<text x="32" y="194" fill="#d7e7df" font-family="sans-serif" font-size="22">',
            record.avoidedMgCo2e.toString(), ' mgCO2e - model estimate</text>',
            '<text x="32" y="252" fill="#d7e7df" font-family="monospace" font-size="16">day ', day, '</text>',
            '<text x="32" y="300" fill="#f0c978" font-family="sans-serif" font-size="18">NOT A VERIFIED OFFSET</text>',
            '</svg>'
        ));
        string memory json = string(abi.encodePacked(
            '{"name":"VoltGrid Solar Allocation #', tokenId.toString(),
            '","description":"Illustrative avoided-emissions model record derived from confirmed simulated local solar seller P2P allocations. Not a verified carbon offset, credit, or regulatory instrument.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes":[',
            '{"trait_type":"dayId","value":"', day, '"},',
            '{"trait_type":"eligibleWh","value":', uint256(record.eligibleWh).toString(), '},',
            '{"trait_type":"factorGPerKwh","value":', uint256(record.factorGPerKwh).toString(), '},',
            '{"trait_type":"factorVersion","value":', uint256(record.factorVersion).toString(), '},',
            '{"trait_type":"avoidedMgCo2e","value":', record.avoidedMgCo2e.toString(), '},',
            '{"trait_type":"factorSource","value":"Configurable VoltGrid modelling assumption; no primary emissions source verified"},',
            '{"trait_type":"provenance","value":"Confirmed TradeSettled solar-seller allocations"},',
            '{"trait_type":"retired","value":', retired[tokenId] ? 'true' : 'false', '}],',
            '"properties":{"formula":"eligibleWh * factorGPerKwh = avoidedMgCo2e",',
            '"factorSource":"Configurable VoltGrid modelling assumption; no primary emissions source verified",',
            '"provenance":"Confirmed TradeSettled solar-seller allocations; excludes imports, exports, buyers, and emergency discharge",',
            '"retired":', retired[tokenId] ? 'true' : 'false', '}'
            '}'));
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }
    // solhint-enable quotes

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (retired[tokenId] && from != address(0) && to != address(0)) {
            revert RetiredTokenCannotTransfer(tokenId);
        }
        return super._update(to, tokenId, auth);
    }

    function _requireMinted(uint256 tokenId) private view {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
    }
}
