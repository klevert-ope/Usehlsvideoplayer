import { expect, test } from "@playwright/test";

test("native HLS decodes on a browser advertising HLS playback", async ({
  page,
}) => {
  await page.goto("/?native");
  const video = page.locator("video");
  const native = await video.evaluate(
    (element) =>
      element.canPlayType("application/vnd.apple.mpegurl") ||
      element.canPlayType("application/x-mpegURL"),
  );
  if (!native && process.env.REQUIRE_NATIVE_HLS === "1")
    throw new Error("Native HLS is required for this gate");
  test.skip(!native, "Browser does not advertise native HLS");
  await expect(page.getByTestId("engine")).toHaveText("native");
  await expect(page.getByTestId("status")).toHaveText("ready");
  await page.getByRole("button", { name: "Play stream" }).click();
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0.25);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect
    .poll(() =>
      video.evaluate((element) => [
        element.hasAttribute("src"),
        element.readyState,
      ]),
    )
    .toEqual([false, 0]);
});
