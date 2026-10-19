// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CertificateVerification {

    address public owner;

    mapping(address => bool) public authorizedIssuers;

    struct Certificate {
        bytes32 certificateHash;
        string certificateId;
        address issuer;
        uint256 issuedAt;
        bool revoked;
        uint256 revokedAt;
    }

    // Certificate hash => certificate information
    mapping(bytes32 => Certificate) public certificates;

    // Prevent the same certificate ID from being registered twice
    mapping(bytes32 => bool) private certificateIds;

    event IssuerAdded(address indexed issuer);
    event IssuerRemoved(address indexed issuer);

    event CertificateIssued(
        bytes32 indexed certificateHash,
        string certificateId,
        address indexed issuer,
        uint256 issuedAt
    );

    event CertificateRevoked(
        bytes32 indexed certificateHash,
        string certificateId,
        address indexed issuer,
        uint256 revokedAt
    );

    constructor() {
        owner = msg.sender;
    }

    // --------------------------------------------------
    // ACCESS CONTROL
    // --------------------------------------------------

    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "Only owner can perform this action"
        );
        _;
    }

    modifier onlyIssuer() {
        require(
            authorizedIssuers[msg.sender],
            "Not an authorized issuer"
        );
        _;
    }

    // --------------------------------------------------
    // ISSUER MANAGEMENT
    // --------------------------------------------------

    function registerIssuer(address issuer) public onlyOwner {
        require(
            issuer != address(0),
            "Invalid issuer address"
        );

        require(
            !authorizedIssuers[issuer],
            "Issuer already registered"
        );

        authorizedIssuers[issuer] = true;

        emit IssuerAdded(issuer);
    }

    function removeIssuer(address issuer) public onlyOwner {
        require(
            authorizedIssuers[issuer],
            "Issuer is not registered"
        );

        authorizedIssuers[issuer] = false;

        emit IssuerRemoved(issuer);
    }

    // --------------------------------------------------
    // CERTIFICATE ISSUANCE
    // --------------------------------------------------

    function issueCertificate(
        bytes32 certificateHash,
        string memory certificateId
    ) public onlyIssuer {

        require(
            certificateHash != bytes32(0),
            "Invalid certificate hash"
        );

        require(
            bytes(certificateId).length > 0,
            "Invalid certificate ID"
        );

        // Prevent duplicate certificate hash
        require(
            certificates[certificateHash].issuedAt == 0,
            "Certificate already exists"
        );

        // Prevent duplicate certificate ID
        bytes32 certificateIdHash = keccak256(
            bytes(certificateId)
        );

        require(
            !certificateIds[certificateIdHash],
            "Certificate ID already exists"
        );

        certificates[certificateHash] = Certificate({
            certificateHash: certificateHash,
            certificateId: certificateId,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            revoked: false,
            revokedAt: 0
        });

        certificateIds[certificateIdHash] = true;

        emit CertificateIssued(
            certificateHash,
            certificateId,
            msg.sender,
            block.timestamp
        );
    }

    // --------------------------------------------------
    // CERTIFICATE VERIFICATION
    // --------------------------------------------------

    function verifyCertificate(
        bytes32 certificateHash
    )
        public
        view
        returns (
            bool valid,
            bool revoked,
            string memory certificateId,
            address issuer,
            uint256 issuedAt
        )
    {
        Certificate memory certificate =
            certificates[certificateHash];

        // Certificate does not exist
        if (certificate.issuedAt == 0) {
            return (
                false,
                false,
                "",
                address(0),
                0
            );
        }

        // valid is TRUE only if the certificate exists
        // and has not been revoked.
        return (
            !certificate.revoked,
            certificate.revoked,
            certificate.certificateId,
            certificate.issuer,
            certificate.issuedAt
        );
    }

    // --------------------------------------------------
    // GET CERTIFICATE
    // --------------------------------------------------

    function getCertificate(
        bytes32 certificateHash
    )
        public
        view
        returns (
            bytes32,
            string memory,
            address,
            uint256,
            bool,
            uint256
        )
    {
        Certificate memory certificate =
            certificates[certificateHash];

        require(
            certificate.issuedAt != 0,
            "Certificate does not exist"
        );

        return (
            certificate.certificateHash,
            certificate.certificateId,
            certificate.issuer,
            certificate.issuedAt,
            certificate.revoked,
            certificate.revokedAt
        );
    }

    // --------------------------------------------------
    // CERTIFICATE REVOCATION
    // --------------------------------------------------

    function revokeCertificate(
        bytes32 certificateHash
    ) public {

        Certificate storage certificate =
            certificates[certificateHash];

        require(
            certificate.issuedAt != 0,
            "Certificate does not exist"
        );

        require(
            !certificate.revoked,
            "Certificate already revoked"
        );

        // The original issuer or the contract owner
        // can revoke the certificate.
        require(
            msg.sender == certificate.issuer ||
            msg.sender == owner,
            "Not authorized to revoke"
        );

        certificate.revoked = true;
        certificate.revokedAt = block.timestamp;

        emit CertificateRevoked(
            certificateHash,
            certificate.certificateId,
            certificate.issuer,
            block.timestamp
        );
    }
}