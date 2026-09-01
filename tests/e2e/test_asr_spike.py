from pathlib import Path

from playwright.sync_api import sync_playwright

CHROME = Path.home() / ".cache/webmcp-chrome/chrome/linux-154.0.8035.0/chrome-linux64/chrome"


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=str(CHROME),
            chromium_sandbox=True,
        )
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:4317/", wait_until="domcontentloaded")

        assert page.title() == "IN WRITING — live call facts"
        assert page.locator('head meta[http-equiv="origin-trial"]').count() == 1
        assert page.locator('head meta[http-equiv="origin-trial"] + script').count() == 0
        assert page.get_by_text("mock platform with synthetic audio", exact=False).is_visible()
        assert page.get_by_text("Notice received", exact=True).is_visible()
        assert page.get_by_text(
            "Recording laws differ by jurisdiction. This demonstration does not adjudicate them.",
            exact=False,
        ).is_visible()
        assert page.get_by_text(
            "Before any real recording, check the applicable rule and obtain required consent.",
            exact=False,
        ).is_visible()
        assert page.get_by_text("Closed-vocabulary acoustic detector", exact=True).is_visible()
        assert page.get_by_test_id("privacy-boundary").inner_text() == (
            "Full transcript stored: 0 words"
        )
        assert page.get_by_test_id("webmcp-status").inner_text() == (
            "WebMCP unavailable in this browser · local demo remains available"
        )
        body = page.locator("body").inner_text()
        assert "Say:" not in body
        assert "marked time-barred in its cited source table" not in body
        assert "transcribed inside this tab" not in body
        assert errors == []
        browser.close()


if __name__ == "__main__":
    main()
