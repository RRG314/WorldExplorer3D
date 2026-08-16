#!/usr/bin/env python3
"""Offline, hash-pinned NAVD88/GEOID18 to WGS84(G1674)/EGM2008 normalizer."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import shutil
import struct
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

NORMALIZER_NAME = "we3d-proj-vdatum"
NORMALIZER_VERSION = "1.0.0"
REQUIRED_PYPROJ_VERSION = "3.7.2"
REQUIRED_PROJ_VERSION = "9.5.1"
TARGET_HORIZONTAL_FRAME = "WGS84_G1674"
TARGET_VERTICAL_DATUM = "EGM2008"
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")

GEOID18 = {
    "id": "NOAA_GEOID18_CONUS",
    "filename": "us_noaa_g2018u0.tif",
    "url": "https://cdn.proj.org/us_noaa_g2018u0.tif",
    "sha256": "fa9a407ac7ee3f5a3694008e4bcd09ce9cc250452f0c3b11700a4960340abce2",
}
EGM2008 = {
    "id": "NOAA_VDATUM_EGM2008_1MIN",
    "filename": "egm2008.gtx",
    "archiveUrl": "https://vdatum.noaa.gov/download/data/vdatum_EGM2008.zip",
    "archiveSha256": "09e808270b311def88f81439fee2b680a57f183a216427cb8612956d314bde24",
    "archiveMember": "vdatum/core/egm2008/egm2008.gtx",
    "sha256": "013efc11e58f5251d1d5f18a737b73dd8cd43857a8c37dcad8dd2f9c98e8da96",
}
GRID_SPECS = (GEOID18, EGM2008)

# NOAA VDatum's published one-sigma component uncertainties for CONUS.
# Source: https://vdatum.noaa.gov/docs/est_uncertainties.html (Table 2).
NOAA_COMPONENT_STANDARD_UNCERTAINTY_METERS = (
    0.020,  # ITRF to NAD83 transformation
    0.050,  # NAD83 to NAVD88 transformation
    0.103,  # EGM2008 to WGS84 transformation
    0.020,  # NAD83 source datum
    0.050,  # NAVD88 source datum
    0.114,  # EGM2008 source datum
)


def canonical_json(value: object) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_sha256(path: Path, expected: str, label: str) -> None:
    actual = sha256_file(path)
    if actual != expected:
        raise ValueError(f"{label} SHA-256 mismatch: expected {expected}, got {actual}")


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=destination.parent, prefix=f".{destination.name}.", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
        try:
            with urllib.request.urlopen(url) as response:
                shutil.copyfileobj(response, temporary)
            os.replace(temporary_path, destination)
        except BaseException:
            temporary_path.unlink(missing_ok=True)
            raise


def prepare_grids(grid_directory: Path) -> dict:
    grid_directory = grid_directory.resolve()
    grid_directory.mkdir(parents=True, exist_ok=True)
    geoid_path = grid_directory / GEOID18["filename"]
    if not geoid_path.exists():
        download(GEOID18["url"], geoid_path)
    require_sha256(geoid_path, GEOID18["sha256"], GEOID18["id"])

    egm_path = grid_directory / EGM2008["filename"]
    if not egm_path.exists():
        archive_path = grid_directory / "vdatum_EGM2008.zip"
        if not archive_path.exists():
            download(EGM2008["archiveUrl"], archive_path)
        require_sha256(
            archive_path, EGM2008["archiveSha256"], f"{EGM2008['id']} archive"
        )
        with (
            zipfile.ZipFile(archive_path) as archive,
            archive.open(EGM2008["archiveMember"]) as source,
        ):
            # Close the temporary stream before the atomic replace for Windows.
            temporary = tempfile.NamedTemporaryFile(  # noqa: SIM115
                dir=grid_directory, prefix=".egm2008.", delete=False
            )
            temporary_path = Path(temporary.name)
            try:
                with temporary:
                    shutil.copyfileobj(source, temporary)
                os.replace(temporary_path, egm_path)
            except BaseException:
                temporary_path.unlink(missing_ok=True)
                raise
    require_sha256(egm_path, EGM2008["sha256"], EGM2008["id"])
    return {
        "ok": True,
        "gridDirectory": str(grid_directory.resolve()),
        "grids": [
            {
                "id": spec["id"],
                "path": str((grid_directory / spec["filename"]).resolve()),
                "sha256": spec["sha256"],
            }
            for spec in GRID_SPECS
        ],
    }


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise TypeError(f"{path} must contain a JSON object")
    return value


def require_text(value: object, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} is required")
    return text


def acquisition_epoch(sample: dict) -> float:
    parsed = []
    for field in ("acquisitionStartDate", "acquisitionEndDate"):
        raw = re.sub(r"\D", "", str(sample.get(field, "")))
        if len(raw) != 8:
            raise ValueError(f"{sample.get('key', 'sample')} has invalid {field}")
        parsed.append(dt.date.fromisoformat(f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"))
    midpoint = parsed[0] + (parsed[1] - parsed[0]) / 2
    year_start = dt.date(midpoint.year, 1, 1)
    next_year = dt.date(midpoint.year + 1, 1, 1)
    return midpoint.year + (midpoint - year_start).days / (next_year - year_start).days


def validate_attestations(request: dict, attestations: dict) -> dict[str, dict]:
    if attestations.get("schemaVersion") != 1:
        raise ValueError("source attestation schema is unsupported")
    if attestations.get("type") != "GroundSourceAttestationSet":
        raise ValueError("source attestation type is invalid")
    request_hash = require_text(
        request.get("sourceContentSha256"), "request source hash"
    )
    if attestations.get("sourceContentSha256") != request_hash:
        raise ValueError("source attestation is not bound to the raw sample set")
    records = attestations.get("rasters")
    if not isinstance(records, list) or not records:
        raise ValueError("at least one raster attestation is required")
    by_id: dict[str, dict] = {}
    for record in records:
        raster_id = require_text(record.get("rasterId"), "attestation rasterId")
        if raster_id in by_id:
            raise ValueError(f"duplicate raster attestation: {raster_id}")
        source_horizontal_frame = record.get("sourceHorizontalFrame")
        if source_horizontal_frame not in {"NAD83", "NAD83_2011"}:
            raise ValueError(f"raster {raster_id} is not proven NAD83")
        if record.get("sourceVerticalDatum") != "NAVD88":
            raise ValueError(f"raster {raster_id} is not proven NAVD88")
        source_geoid_model = record.get("sourceGeoidModel")
        if source_geoid_model not in {"GEOID18", "unspecified"}:
            raise ValueError(f"raster {raster_id} has an unsupported source geoid")
        metadata_hash = require_text(
            record.get("metadataSha256"), f"raster {raster_id} metadata SHA-256"
        )
        if not SHA256_PATTERN.fullmatch(metadata_hash):
            raise ValueError(f"raster {raster_id} metadata SHA-256 is invalid")
        metadata_url = require_text(
            record.get("metadataUrl"), f"raster {raster_id} metadata URL"
        )
        if not metadata_url.startswith("https://"):
            raise ValueError(f"raster {raster_id} metadata URL must use HTTPS")
        accuracy = float(record.get("verticalAccuracyRmseMeters", math.nan))
        if not math.isfinite(accuracy) or accuracy <= 0 or accuracy > 1:
            raise ValueError(f"raster {raster_id} vertical accuracy is invalid")
        sampling_uncertainty = float(record.get("samplingUncertaintyMeters", 0))
        if (
            not math.isfinite(sampling_uncertainty)
            or sampling_uncertainty < 0
            or sampling_uncertainty > 0.75
        ):
            raise ValueError(
                f"raster {raster_id} sampling uncertainty is invalid"
            )
        reference_frame_uncertainty = float(
            record.get("referenceFrameUncertaintyMeters", 0)
        )
        if (
            not math.isfinite(reference_frame_uncertainty)
            or reference_frame_uncertainty < 0
            or reference_frame_uncertainty > 0.5
        ):
            raise ValueError(
                f"raster {raster_id} reference-frame uncertainty is invalid"
            )
        if (
            (source_horizontal_frame != "NAD83_2011" or source_geoid_model != "GEOID18")
            and reference_frame_uncertainty <= 0
        ):
            raise ValueError(
                f"raster {raster_id} requires reference-frame uncertainty"
            )
        by_id[raster_id] = record
    return by_id


def validate_request(request: dict, attestations: dict[str, dict]) -> list[dict]:
    if request.get("schemaVersion") != 1:
        raise ValueError("normalization request schema is unsupported")
    if request.get("type") != "GroundNormalizationRequest":
        raise ValueError("normalization request type is invalid")
    if request.get("sourceHorizontalFrame") != "NAD83":
        raise ValueError("normalization request source horizontal frame is unsupported")
    if request.get("sourceVerticalDatum") != "NAVD88":
        raise ValueError("normalization request source vertical datum is unsupported")
    if request.get("targetHorizontalFrame") != TARGET_HORIZONTAL_FRAME:
        raise ValueError("normalization request target horizontal frame is unsupported")
    if request.get("targetVerticalDatum") != TARGET_VERTICAL_DATUM:
        raise ValueError("normalization request target vertical datum is unsupported")
    samples = request.get("samples")
    if not isinstance(samples, list) or len(samples) != request.get("sampleCount"):
        raise ValueError("normalization request sample count is invalid")
    keys = set()
    for sample in samples:
        key = require_text(sample.get("key"), "sample key")
        if key in keys:
            raise ValueError(f"duplicate sample key: {key}")
        keys.add(key)
        raster_id = require_text(sample.get("rasterId"), f"{key} rasterId")
        attestation = attestations.get(raster_id)
        if not attestation:
            raise ValueError(f"{key} has no source attestation for raster {raster_id}")
        if str(sample.get("sourceRelease", "")) != str(
            attestation.get("sourceRelease", "")
        ):
            raise ValueError(f"{key} source release does not match its attestation")
        for field in ("latitude", "longitude", "elevationMeters"):
            value = float(sample.get(field, math.nan))
            if not math.isfinite(value):
                raise ValueError(f"{key} {field} must be finite")
        acquisition_epoch(sample)
    return samples


def bind_attestation(
    request_path: Path, template_path: Path, output_path: Path
) -> dict:
    request = read_json(request_path)
    template = read_json(template_path)
    if template.get("schemaVersion") != 1:
        raise ValueError("source attestation template schema is unsupported")
    if template.get("type") != "GroundSourceAttestationTemplate":
        raise ValueError("source attestation template type is invalid")
    document = {
        **template,
        "type": "GroundSourceAttestationSet",
        "sourceContentSha256": require_text(
            request.get("sourceContentSha256"), "request source hash"
        ),
    }
    attestations = validate_attestations(request, document)
    validate_request(request, attestations)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(canonical_json(document), encoding="utf-8")
    return {
        "ok": True,
        "command": "bind-attestation",
        "output": str(output_path.resolve()),
        "sourceContentSha256": document["sourceContentSha256"],
        "rasterCount": len(document["rasters"]),
    }


def import_projection_engine():
    try:
        import pyproj
        from pyproj import Transformer
    except ImportError as error:
        raise RuntimeError(
            "pyproj is required; install scripts/ground-datum-requirements.txt"
        ) from error
    if pyproj.__version__ != REQUIRED_PYPROJ_VERSION:
        raise RuntimeError(
            f"pyproj {REQUIRED_PYPROJ_VERSION} is required, got {pyproj.__version__}"
        )
    if pyproj.proj_version_str != REQUIRED_PROJ_VERSION:
        raise RuntimeError(
            f"PROJ {REQUIRED_PROJ_VERSION} is required, got {pyproj.proj_version_str}"
        )
    return pyproj, Transformer


def operation_pipeline(geoid_path: Path, egm_path: Path) -> str:
    return (
        "proj=pipeline "
        "step proj=unitconvert xy_in=deg xy_out=rad "
        f"step proj=vgridshift grids={geoid_path} multiplier=1 "
        "step proj=cart ellps=GRS80 "
        "step inv proj=helmert "
        "x=0.99343 y=-1.90331 z=-0.52655 "
        "rx=0.02591467 ry=0.00942644999999999 rz=0.01159935 "
        "s=0.00171504 dx=0.00079 dy=-0.0006 dz=-0.00134 "
        "drx=6.667e-05 dry=-0.00075744 drz=-5.133e-05 "
        "ds=-0.00010201 t_epoch=1997 convention=coordinate_frame "
        "step inv proj=cart ellps=WGS84 "
        f"step inv proj=vgridshift grids={egm_path} multiplier=1 "
        "step proj=unitconvert xy_in=rad xy_out=deg"
    )


def uncertainty_95_meters(
    source_accuracy_rmse_meters: float,
    sampling_uncertainty_meters: float = 0,
    reference_frame_uncertainty_meters: float = 0,
) -> float:
    source_sigma = source_accuracy_rmse_meters
    sigma = math.hypot(source_sigma, *NOAA_COMPONENT_STANDARD_UNCERTAINTY_METERS)
    return math.hypot(
        sigma * 1.96,
        sampling_uncertainty_meters,
        reference_frame_uncertainty_meters,
    )


def dataset_sha256() -> str:
    evidence = [{"id": spec["id"], "sha256": spec["sha256"]} for spec in GRID_SPECS]
    return hashlib.sha256(canonical_json(evidence).encode("utf-8")).hexdigest()


def normalize(
    request_path: Path,
    attestation_path: Path,
    grid_directory: Path,
    output_path: Path,
) -> dict:
    grid_directory = grid_directory.resolve()
    request = read_json(request_path)
    attestation_document = read_json(attestation_path)
    attestations = validate_attestations(request, attestation_document)
    samples = validate_request(request, attestations)
    prepared = prepare_grids(grid_directory)
    pyproj, Transformer = import_projection_engine()
    geoid_path = grid_directory / GEOID18["filename"]
    egm_path = grid_directory / EGM2008["filename"]
    pipeline = operation_pipeline(geoid_path, egm_path)
    transformer = Transformer.from_pipeline(pipeline)
    canonical_pipeline = operation_pipeline(
        Path(GEOID18["filename"]), Path(EGM2008["filename"])
    )
    operation_hash = hashlib.sha256(canonical_pipeline.encode("utf-8")).hexdigest()

    outputs = []
    for sample in samples:
        raster_id = str(sample["rasterId"])
        epoch = acquisition_epoch(sample)
        longitude, latitude, elevation, transformed_epoch = transformer.transform(
            float(sample["longitude"]),
            float(sample["latitude"]),
            float(sample["elevationMeters"]),
            epoch,
        )
        values = (longitude, latitude, elevation, transformed_epoch)
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"normalization failed for {sample['key']}")
        uncertainty = uncertainty_95_meters(
            float(attestations[raster_id]["verticalAccuracyRmseMeters"]),
            float(attestations[raster_id].get("samplingUncertaintyMeters", 0)),
            float(attestations[raster_id].get("referenceFrameUncertaintyMeters", 0)),
        )
        outputs.append(
            {
                "key": sample["key"],
                "groundElevationMeters": elevation,
                "latitude": latitude,
                "longitude": longitude,
                "coordinateEpoch": transformed_epoch,
                "uncertaintyMeters": uncertainty,
                "uncertaintyConfidence": 0.95,
                "rasterId": raster_id,
            }
        )

    document = {
        "schemaVersion": 1,
        "type": "GroundNormalizationResult",
        "complete": True,
        "sourceContentSha256": request["sourceContentSha256"],
        "targetHorizontalFrame": TARGET_HORIZONTAL_FRAME,
        "targetVerticalDatum": TARGET_VERTICAL_DATUM,
        "normalizer": {
            "name": NORMALIZER_NAME,
            "version": NORMALIZER_VERSION,
            "pyprojVersion": pyproj.__version__,
            "projVersion": pyproj.proj_version_str,
            "datasetSha256": dataset_sha256(),
            "operationSha256": operation_hash,
            "grids": prepared["grids"],
            "uncertaintyPolicy": "NOAA-VDatum-CONUS-table2-plus-source-95",
        },
        "sampleCount": len(outputs),
        "samples": outputs,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(canonical_json(document), encoding="utf-8")
    return {
        "ok": True,
        "command": "normalize",
        "output": str(output_path.resolve()),
        "sampleCount": len(outputs),
        "datasetSha256": document["normalizer"]["datasetSha256"],
        "maximumUncertaintyMeters": max(
            output["uncertaintyMeters"] for output in outputs
        ),
    }


def write_constant_gtx(path: Path, value: float) -> None:
    # PROJ GTX: big-endian origin lat/lon, increments, rows/cols, then float grid.
    with path.open("wb") as stream:
        stream.write(struct.pack(">ddddii", -90.0, -180.0, 180.0, 360.0, 2, 2))
        stream.write(struct.pack(">ffff", value, value, value, value))


def self_test() -> dict:
    pyproj, Transformer = import_projection_engine()
    with tempfile.TemporaryDirectory(prefix="we3d-datum-test-") as directory:
        root = Path(directory)
        geoid = root / "geoid.gtx"
        egm = root / "egm.gtx"
        write_constant_gtx(geoid, -30.0)
        write_constant_gtx(egm, -29.5)
        transformer = Transformer.from_pipeline(operation_pipeline(geoid, egm))
        result = transformer.transform(-76.6122, 39.2904, 10.0, 2024.95)
        if not all(math.isfinite(value) for value in result):
            raise AssertionError("datum self-test produced a non-finite value")
        uncertainty = uncertainty_95_meters(0.10)
        if not 0.38 < uncertainty < 0.40:
            raise AssertionError(f"unexpected uncertainty result: {uncertainty}")
        request = {
            "schemaVersion": 1,
            "type": "GroundNormalizationRequest",
            "sourceContentSha256": "a" * 64,
            "sourceHorizontalFrame": "NAD83",
            "sourceVerticalDatum": "NAVD88",
            "targetHorizontalFrame": TARGET_HORIZONTAL_FRAME,
            "targetVerticalDatum": TARGET_VERTICAL_DATUM,
            "sampleCount": 1,
            "samples": [
                {
                    "key": "0:0",
                    "rasterId": "fixture",
                    "sourceRelease": "fixture-release",
                    "latitude": 39.0,
                    "longitude": -76.0,
                    "elevationMeters": 10.0,
                    "acquisitionStartDate": "20240101",
                    "acquisitionEndDate": "20240102",
                }
            ],
        }
        attestation = {
            "schemaVersion": 1,
            "type": "GroundSourceAttestationSet",
            "sourceContentSha256": "a" * 64,
            "rasters": [
                {
                    "rasterId": "fixture",
                    "sourceRelease": "fixture-release",
                    "sourceHorizontalFrame": "NAD83_2011",
                    "sourceVerticalDatum": "NAVD88",
                    "sourceGeoidModel": "GEOID18",
                    "verticalAccuracyRmseMeters": 0.10,
                    "metadataUrl": "https://example.invalid/fixture.pdf",
                    "metadataSha256": "b" * 64,
                }
            ],
        }
        verified = validate_attestations(request, attestation)
        validate_request(request, verified)
        rejected = dict(attestation)
        rejected["sourceContentSha256"] = "c" * 64
        try:
            validate_attestations(request, rejected)
        except ValueError as error:
            if "not bound" not in str(error):
                raise
        else:
            raise AssertionError("unbound source attestation was accepted")
        return {
            "ok": True,
            "command": "self-test",
            "pyprojVersion": pyproj.__version__,
            "projVersion": pyproj.proj_version_str,
            "pipelineFinite": True,
            "sourceAttestationVerified": True,
            "unboundAttestationRejected": True,
            "uncertainty95Meters": uncertainty,
        }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Prepare and run the WorldExplorer3D offline datum normalizer."
    )
    subparsers = result.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare", help="download and verify datum grids")
    prepare.add_argument("--grid-dir", required=True, type=Path)
    normalize_parser = subparsers.add_parser(
        "normalize", help="produce a hash-attested normalization document"
    )
    normalize_parser.add_argument("--request", required=True, type=Path)
    normalize_parser.add_argument("--attestation", required=True, type=Path)
    normalize_parser.add_argument("--grid-dir", required=True, type=Path)
    normalize_parser.add_argument("--output", required=True, type=Path)
    bind_parser = subparsers.add_parser(
        "bind-attestation",
        help="bind a reviewed raster-attestation template to one raw sample set",
    )
    bind_parser.add_argument("--request", required=True, type=Path)
    bind_parser.add_argument("--template", required=True, type=Path)
    bind_parser.add_argument("--output", required=True, type=Path)
    subparsers.add_parser("self-test", help="test the pinned projection engine")
    return result


def main() -> int:
    arguments = parser().parse_args()
    try:
        if arguments.command == "prepare":
            result = prepare_grids(arguments.grid_dir)
        elif arguments.command == "normalize":
            result = normalize(
                arguments.request,
                arguments.attestation,
                arguments.grid_dir,
                arguments.output,
            )
        elif arguments.command == "bind-attestation":
            result = bind_attestation(
                arguments.request, arguments.template, arguments.output
            )
        else:
            result = self_test()
        print(canonical_json(result), end="")
        return 0
    except Exception as error:  # noqa: BLE001 - CLI must return structured failures.
        print(
            canonical_json(
                {"ok": False, "command": arguments.command, "error": str(error)}
            ),
            file=sys.stderr,
            end="",
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
