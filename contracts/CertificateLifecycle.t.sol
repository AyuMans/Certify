// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CertificateVerification} from "./CertificateVerification.sol";

contract CertificateLifecycleTest is Test {
    CertificateVerification registry;
    address issuer = address(0x123);
    address outsider = address(0x456);
    bytes32 original = keccak256("original PDF");
    bytes32 corrected = keccak256("corrected PDF");
    bytes32 details = keccak256("academic details");

    function setUp() public {
        registry = new CertificateVerification();
        registry.registerIssuer(issuer);
        vm.prank(issuer);
        registry.issueCertificateWithDetails(original, "ACV-001", details);
    }

    function test_AcademicHashAndIdLookup() public view {
        (bytes32 stored, bytes32 previous, bytes32 replacement) = registry.getAcademicRecord(original);
        assertEq(stored, details);
        assertEq(previous, bytes32(0));
        assertEq(replacement, bytes32(0));
        assertEq(registry.getCertificateHashById("ACV-001"), original);
        assertEq(registry.getCertificateHashById("missing"), bytes32(0));
    }

    function test_RejectEmptyAcademicHash() public {
        vm.prank(issuer);
        vm.expectRevert("Academic hash is required");
        registry.issueCertificateWithDetails(corrected, "ACV-002", bytes32(0));
    }

    function test_OwnerReplacementPreservesBothLinks() public {
        registry.replaceCertificate(original, corrected, "ACV-001-R1", details);
        (, bytes32 oldPrevious, bytes32 next) = registry.getAcademicRecord(original);
        (, bytes32 previous, bytes32 newNext) = registry.getAcademicRecord(corrected);
        assertEq(oldPrevious, bytes32(0));
        assertEq(next, corrected);
        assertEq(previous, original);
        assertEq(newNext, bytes32(0));
        (bool validOld, bool revokedOld,,,) = registry.verifyCertificate(original);
        (bool validNew,,,,) = registry.verifyCertificate(corrected);
        assertFalse(validOld);
        assertFalse(revokedOld); // Superseded is a separate state from revoked.
        assertTrue(validNew);
    }

    function test_OriginalAuthorizedIssuerCanReplace() public {
        vm.prank(issuer);
        registry.replaceCertificate(original, corrected, "ACV-001-R1", details);
        assertEq(registry.getCertificateHashById("ACV-001-R1"), corrected);
    }

    function test_UnrelatedIssuerCannotReplace() public {
        registry.registerIssuer(outsider);
        vm.prank(outsider);
        vm.expectRevert("Not authorized to replace");
        registry.replaceCertificate(original, corrected, "ACV-001-R1", details);
    }

    function test_RemovedIssuerCannotReplace() public {
        registry.removeIssuer(issuer);
        vm.prank(issuer);
        vm.expectRevert("Not authorized to replace");
        registry.replaceCertificate(original, corrected, "ACV-001-R1", details);
    }

    function test_DuplicateIdDoesNotSupersedeOriginal() public {
        vm.expectRevert("Certificate ID already exists");
        registry.replaceCertificate(original, corrected, "ACV-001", details);
        (bool valid,,,,) = registry.verifyCertificate(original);
        assertTrue(valid);
        (, , bytes32 replacement) = registry.getAcademicRecord(original);
        assertEq(replacement, bytes32(0));
        assertEq(registry.getCertificateHashById("ACV-001-R1"), bytes32(0));
    }

    function test_RejectSecondReplacementAndRevocationOfOldVersion() public {
        registry.replaceCertificate(original, corrected, "ACV-001-R1", details);
        vm.expectRevert("Certificate already superseded");
        registry.replaceCertificate(original, keccak256("third PDF"), "ACV-001-R2", details);
        vm.expectRevert("Certificate already superseded");
        registry.revokeCertificate(original);
    }

    function test_RejectReplacementOfRevokedCertificate() public {
        registry.revokeCertificate(original);
        vm.expectRevert("Certificate is revoked");
        registry.replaceCertificate(original, corrected, "ACV-001-R1", details);
    }

    function test_MultipleCorrectionsKeepTheChain() public {
        bytes32 third = keccak256("second corrected PDF");
        registry.replaceCertificate(original, corrected, "ACV-001-R1", details);
        registry.replaceCertificate(corrected, third, "ACV-001-R2", details);
        (, bytes32 previous, bytes32 next) = registry.getAcademicRecord(corrected);
        assertEq(previous, original);
        assertEq(next, third);
        registry.revokeCertificate(third);
        (bool valid, bool revoked,,,) = registry.verifyCertificate(third);
        assertFalse(valid);
        assertTrue(revoked);
    }
}
