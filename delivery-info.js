(function () {
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzHZKXnGomjSslR3C355roaWa7VYpcOdtzuAS7j9ZpT2QyGZAdf5OoYSqo5_DZRqBg/exec";

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeDomain(value) {
    return String(value || "")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase()
      .trim();
  }

  async function initDeliveryNotice() {
    const idx = new URLSearchParams(location.search).get("idx");

    if (!idx) return;

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error("API 응답 오류: " + response.status);
      }

      const data = await response.json();

      if (!Array.isArray(data)) throw new Error("API 응답 형식 오류");

      const currentDomain = normalizeDomain(location.hostname);

      /*
        현재 상품의 배송정보 찾기
      */
      const setting = data.find(function (item) {
        return (
          item.enabled !== false &&
          normalizeDomain(item.domain) === currentDomain &&
          String(item.productId) === String(idx) &&
          cleanText(item.type) === "배송정보"
        );
      });

      /*
        시트에 등록되지 않은 상품
      */
      if (!setting) return;

      /*
        배송 섹션이 아임웹에서
        생성될 때까지 기다림
      */
      let tries = 0;

      const timer = setInterval(function () {
        const deliverySection = document.querySelector(
          ".prod-detail-section--delivery",
        );

        if (!deliverySection) {
          tries++;

          if (tries > 30) {
            clearInterval(timer);
          }

          return;
        }

        /*
            중복 생성 방지
          */
        if (document.querySelector('[data-sheet-notice="delivery"]')) {
          clearInterval(timer);
          return;
        }

        /*
            배송 정보 생성
          */
        const newSection = document.createElement("div");

        newSection.className =
          "prod-detail-section " + "prod-detail-section--reserve-notice";

        newSection.dataset.sheetNotice = "delivery";

        newSection.innerHTML =
          '<div class="prod-detail-section__title">' +
          "배송 정보" +
          "</div>" +
          '<div class="prod-detail-section__content">' +
          escapeHtml(setting.message) +
          "</div>";

        deliverySection.insertAdjacentElement("afterend", newSection);

        clearInterval(timer);
      }, 200);
    } catch (error) {
      console.error("배송정보 불러오기 실패:", error);
    }
  }

  function escapeHtml(value) {
    const div = document.createElement("div");

    div.textContent = String(value || "");

    return div.innerHTML;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDeliveryNotice);
  } else {
    initDeliveryNotice();
  }
})();
