(function () {

  const API_URL =
    "https://script.google.com/macros/s/AKfycbzHZKXnGomjSslR3C355roaWa7VYpcOdtzuAS7j9ZpT2QyGZAdf5OoYSqo5_DZRqBg/exec";

  const domain =
    normalizeDomain(location.hostname);

  const productId =
    new URLSearchParams(location.search).get("idx");

  if (!productId) return;


  init();


  /* ========================================
     1. 시작
  ======================================== */

  async function init() {

    try {

      /* 구글시트 API */
      const response =
        await fetch(API_URL, {
          cache: "no-store"
        });


      if (!response.ok) {
        throw new Error(
          "API 오류: " + response.status
        );
      }


      const data =
        await response.json();


      /* 현재 상품의 구매혜택만 */
      const benefits =
        data.filter(function (item) {

          return (
            item.enabled !== false &&
            normalizeDomain(item.domain) === domain &&
            String(item.productId) === String(productId) &&
            cleanText(item.type) === "구매혜택" &&
            cleanText(item.setupProductId)
          );

        });


      if (!benefits.length) return;


      /* 필요한 아임웹 영역 대기 */
      const container =
        await waitFor("#prod_detail_body");

      const currentTitleEl =
        await waitFor("h1.view_tit");

      const deliveryGuide =
        await waitFor(
          ".prod-detail-section.prod-detail-section--delivery"
        );


      if (
        !container ||
        !currentTitleEl ||
        !deliveryGuide
      ) {
        return;
      }


      const currentProductName =
        getProductTitle(
          currentTitleEl
        );


      /* ========================================
         2. 기존 생성본 제거
      ======================================== */

      container
        .querySelectorAll(
          ".benefit-setup--sheet"
        )
        .forEach(function (el) {
          el.remove();
        });


      document
        .querySelectorAll(
          ".benefit-injected"
        )
        .forEach(function (el) {
          el.remove();
        });



      /* ========================================
         3. 구글시트 → benefit-setup 생성
      ======================================== */

      const fragment =
        document.createDocumentFragment();


      benefits.forEach(function (benefit) {

        const setupId =
          cleanText(
            benefit.setupProductId
          );


        const setupTitle =
          cleanText(
            benefit.setupTitle
          );


        const discount =
          cleanText(
            benefit.discount
          );


        /*
          SET 상품명에서
          현재 상품을 제외한 짝 상품명 추출
        */
        const counterpart =
          getCounterpartName(
            setupTitle,
            currentProductName
          );


        /*
          구글시트 문구

          예:
          할인 받고 {상품명} 셋업으로 구매하러 가기→
        */
        let message =
          cleanText(
            benefit.message
          ) ||
          "할인 받고 {상품명} 셋업으로 구매하러 가기→";


        /*
          {상품명} 치환
        */
        message =
          message.replace(
            /\{상품명\}/g,
            counterpart
          );


        /*
          할인 있음
          → 15% 할인 받고 A Pants 셋업으로...

          할인 없음
          → A Pants 셋업으로...
        */
        if (discount) {

          message =
            discount +
            " " +
            message;

        } else {

          message =
            message.replace(
              /^할인\s*받고\s*/i,
              ""
            );

        }


        /*
          기존 HTML과 동일한
          benefit-setup 구조 생성
        */
        const target =
          document.createElement("div");


        target.className =
          "benefit-setup benefit-setup--sheet";


        target.style.display =
          "none";


        const wrap =
          document.createElement("div");


        wrap.className =
          "benefit-wrap prod-detail-section";


        wrap.style.display =
          "flex";


        const title =
          document.createElement("div");


        title.className =
          "prod-detail-section__title";


        title.textContent =
          "구매 혜택";


        const content =
          document.createElement("div");


        content.className =
          "prod-detail-section__content";


        const paragraph =
          document.createElement("p");


        paragraph.className =
          "prod-detail-section__item";


        const link =
          document.createElement("a");


        link.href =
          buildProductUrl(
            setupId
          );


        link.textContent =
          message;


        paragraph.appendChild(
          link
        );


        content.appendChild(
          paragraph
        );


        wrap.appendChild(
          title
        );


        wrap.appendChild(
          content
        );


        target.appendChild(
          wrap
        );


        fragment.appendChild(
          target
        );

      });


      /*
        여러 셋업이 있어도
        한 번에 DOM 삽입
      */
      container.appendChild(
        fragment
      );



      /* ========================================
         4. 실제 구매혜택 노출
      ======================================== */

      injectBenefit(
        deliveryGuide
      );


    } catch (error) {

      console.error(
        "구매혜택 실행 오류:",
        error
      );

    }

  }



/* ========================================
   5. 구매혜택 실제 삽입
======================================== */

function injectBenefit(
  deliveryGuide
) {

  if (!deliveryGuide) return;


  /*
    상품 상세정보 전체 영역
  */
  const detailWrap =
    document.querySelector(
      "._item_detail_wrap"
    );


  if (!detailWrap) return;


  const targets = [
    ...document.querySelectorAll(
      "#prod_detail_body .benefit-setup--sheet"
    )
  ]
    .reverse()
    .filter(Boolean);


  if (!targets.length) return;


  /*
    배송정보 하단 구분선
  */
  deliveryGuide.style.setProperty(
    "border-bottom",
    "1px solid rgba(30, 30, 30, 0.1)",
    "important"
  );


  deliveryGuide.style.setProperty(
    "padding-bottom",
    "12px",
    "important"
  );


  /*
    구매혜택을
    _item_detail_wrap의 마지막 자식으로 삽입
  */
  targets.forEach(function (target) {

    const originalWrap =
      target.querySelector(
        ".benefit-wrap"
      );


    if (!originalWrap) return;


    const cloned =
      originalWrap.cloneNode(
        true
      );


    cloned.classList.add(
      "benefit-injected"
    );


    detailWrap.appendChild(
      cloned
    );

  });

}


  /* ========================================
     6. SET 상품명 → 짝 상품명
  ======================================== */

  function getCounterpartName(
    setupTitle,
    currentProductName
  ) {

    /*
      예:

      Autograph T-shirt / Switchback Pants SET

      현재 상품:
      Autograph T-shirt

      결과:
      Switchback Pants
    */

    const parts =
      cleanText(setupTitle)
        .replace(
          /\s+SET$/i,
          ""
        )
        .split("/")
        .map(cleanText)
        .filter(Boolean);


    const current =
      normalizeProductName(
        currentProductName
      );


    return (
      parts.find(function (name) {

        return (
          normalizeProductName(name)
          !== current
        );

      }) || ""
    );

  }



  /* ========================================
     7. 현재 상품명 추출
     NEW / SALE 배지 제외
  ======================================== */

  function getProductTitle(
    element
  ) {

    if (!element) return "";


    const clone =
      element.cloneNode(true);


    clone
      .querySelectorAll(
        ".ns-icon"
      )
      .forEach(function (el) {
        el.remove();
      });


    return cleanText(
      clone.textContent
    );

  }



  /* ========================================
     8. DOM 대기
  ======================================== */

  function waitFor(
    selector
  ) {

    return new Promise(
      function (resolve) {

        const found =
          document.querySelector(
            selector
          );


        if (found) {

          resolve(found);

          return;

        }


        const observer =
          new MutationObserver(
            function () {

              const element =
                document.querySelector(
                  selector
                );


              if (!element) return;


              observer.disconnect();


              resolve(
                element
              );

            }
          );


        observer.observe(
          document.body,
          {
            childList: true,
            subtree: true
          }
        );

      }
    );

  }



  /* ========================================
     9. 상품 URL 생성
  ======================================== */

  function buildProductUrl(
    id
  ) {

    const url =
      new URL(
        "/shop_view",
        location.origin
      );


    url.searchParams.set(
      "idx",
      String(id)
    );


    return url.toString();

  }



  /* ========================================
     UTIL
  ======================================== */

  function cleanText(
    value
  ) {

    return String(
      value || ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  }



  function normalizeProductName(
    value
  ) {

    return cleanText(value)
      .replace(
        /\s+SET$/i,
        ""
      )
      .toLowerCase()
      .trim();

  }



  function normalizeDomain(
    value
  ) {

    return String(
      value || ""
    )
      .replace(
        /^https?:\/\//i,
        ""
      )
      .replace(
        /^www\./i,
        ""
      )
      .replace(
        /\/.*$/,
        ""
      )
      .toLowerCase()
      .trim();

  }

})();
