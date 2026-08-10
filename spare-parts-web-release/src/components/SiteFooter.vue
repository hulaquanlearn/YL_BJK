<template>
  <footer class="site-footer" aria-label="网站备案信息">
    <div class="site-footer__inner">
      <span class="site-footer__copyright">原粮车间备件管理</span>
      <span class="site-footer__divider" aria-hidden="true"></span>
      <a
        class="site-footer__link"
        href="https://beian.miit.gov.cn/"
        rel="noopener noreferrer"
        target="_blank"
      >
        皖ICP备2026004209号
      </a>
      <span class="site-footer__divider" aria-hidden="true"></span>
      <a
        class="site-footer__link site-footer__security"
        href="https://beian.mps.gov.cn/#/query/webSearch?code=34160202004746"
        rel="noopener noreferrer"
        target="_blank"
      >
        <img :src="publicSecurityRecordIcon" alt="" width="20" height="20" />
        <span>皖公网安备34160202004746号</span>
      </a>
    </div>
  </footer>
</template>

<script setup>
import publicSecurityRecordIcon from '../assets/public-security-record.png'
</script>

<style scoped>
.site-footer {
  flex: 0 0 auto;
  padding: 15px 24px;
  border-top: 1px solid rgba(221, 225, 233, 0.9);
  color: #7b8493;
  background: rgba(255, 255, 255, 0.96);
}

.site-footer__inner {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.site-footer__copyright {
  color: #697386;
  font-weight: 600;
}

.site-footer__divider {
  width: 1px;
  height: 14px;
  background: #d7dce5;
}

.site-footer__link {
  color: #596274;
  text-decoration: none;
  transition: color 0.2s ease;
}

.site-footer__link:hover,
.site-footer__link:focus-visible {
  color: #a71924;
}

.site-footer__security {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.site-footer__security img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

@media (max-width: 760px) {
  .site-footer {
    padding: 13px 14px 16px;
  }

  .site-footer__inner {
    flex-wrap: wrap;
    gap: 7px 10px;
  }

  .site-footer__copyright {
    flex-basis: 100%;
  }

  .site-footer__inner > .site-footer__divider:first-of-type {
    display: none;
  }
}
</style>
