const ADSENSE = {
  enabled: false,
  publisherId: '',
  slotIds: {
    banner_top: 'ad-banner-top',
    banner_mid: 'ad-banner-mid',
    banner_bottom: 'ad-banner-bottom',
    detail_top: 'ad-detail-top',
    detail_bottom: 'ad-detail-bottom',
  },
};

function initAds() {
  if (!ADSENSE.enabled || !ADSENSE.publisherId) return;
  const s = document.createElement('script');
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.publisherId}`;
  s.crossOrigin = 'anonymous';
  s.async = true;
  s.onload = () => {
    Object.values(ADSENSE.slotIds).forEach(id => {
      const container = document.getElementById(id);
      if (!container) return;
      container.innerHTML = `<ins class="adsbygoogle"
        style="display:block"
        data-ad-client="${ADSENSE.publisherId}"
        data-ad-slot="${id}"
        data-ad-format="auto"
        data-full-width-responsive="true"></ins>`;
      container.classList.add('ad-container--visible');
      try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    });
  };
  document.head.appendChild(s);
}
