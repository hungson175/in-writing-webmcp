import hashlib
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
CHROME = Path.home() / ".cache/webmcp-chrome/chrome/linux-154.0.8035.0/chrome-linux64/chrome"


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=str(CHROME),
            chromium_sandbox=True,
        )
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.route("https://**", lambda route: route.abort())
        console_errors: list[str] = []
        page_errors: list[str] = []
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.goto("http://127.0.0.1:4317/", wait_until="networkidle")

        assert page.get_by_text("Closed-vocabulary acoustic detector", exact=True).is_visible()
        assert page.get_by_test_id("privacy-boundary").inner_text() == "Full transcript stored: 0 words"
        play = page.get_by_role("button", name="Play sample call")
        assert play.is_enabled()

        clicked_at = time.monotonic()
        play.click()
        page.wait_for_function(
            "() => !document.querySelector('#fact-card').hidden",
            timeout=15_000,
        )
        warning_at = time.monotonic()
        page.wait_for_function(
            "() => document.querySelector('#call-status').textContent.includes('Synthetic call ended')",
            timeout=30_000,
        )
        warning_seconds = round(warning_at - clicked_at, 3)
        assert warning_seconds <= 10
        assert page.get_by_test_id("detected-phrase").text_content() == "good-faith payment"
        assert page.get_by_test_id("match-score").text_content().startswith("acoustic match ")
        assert page.get_by_test_id("privacy-boundary").inner_text() == "Full transcript stored: 0 words"
        assert console_errors == []
        assert page_errors == []

        sample = ROOT / "public" / "audio" / "sample-call.wav"
        template = ROOT / "public" / "keywords" / "good-faith-payment.wav"
        receipt = {
            "status": "PASS",
            "browser": "Chrome/154.0.8035.0",
            "source": "audio.captureStream MediaStreamTrack -> MediaStreamTrackProcessor PCM -> closed-vocabulary acoustic matcher",
            "warning_seconds_after_click": warning_seconds,
            "threshold_seconds": 10,
            "detected_phrase": "good-faith payment",
            "full_transcript_words_stored": 0,
            "sample_sha256": hashlib.sha256(sample.read_bytes()).hexdigest(),
            "template_sha256": hashlib.sha256(template.read_bytes()).hexdigest(),
            "console_errors": console_errors,
            "page_errors": page_errors,
        }
        output = ROOT / "receipts" / "keyword-spotter-live.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
