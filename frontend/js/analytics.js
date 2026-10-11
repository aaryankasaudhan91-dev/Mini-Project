// frontend/js/analytics.js
// Privacy-First Client Analytics Tracker (Zero Third-Party Cookies, GDPR/DPDP Compliant)

class AnalyticsTracker {
  constructor() {
    this.sessionId = this._getOrCreateSession();
    this.events = [];
    this.consentGiven = localStorage.getItem('gh_cookie_consent') === 'accepted';
  }

  _getOrCreateSession() {
    let sid = sessionStorage.getItem('gh_analytics_sid');
    if (!sid) {
      sid = 'sid_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      sessionStorage.setItem('gh_analytics_sid', sid);
    }
    return sid;
  }

  setConsent(allowed) {
    this.consentGiven = allowed;
    localStorage.setItem('gh_cookie_consent', allowed ? 'accepted' : 'essential');
  }

  trackPageView(pageName) {
    if (!this.consentGiven) return;
    const event = {
      type: 'page_view',
      page: pageName,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || 'direct',
      sessionId: this.sessionId
    };
    this.events.push(event);
    console.log('[Analytics] Page View:', pageName);
  }

  trackEvent(category, action, label = '') {
    if (!this.consentGiven) return;
    const event = {
      type: 'custom_event',
      category,
      action,
      label,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };
    this.events.push(event);
    console.log(`[Analytics] Event [${category}] ${action} (${label})`);
  }
}

export const Analytics = new AnalyticsTracker();
