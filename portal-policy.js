(function (root) {
  'use strict';
  const origin = 'https://centralstudentcouncil2026-rgb.github.io';
  const portals = Object.freeze({
    students: Object.freeze({ name: 'Students Access', url: origin + '/CSC-SYNC-PublicView/students-access.html' }),
    cole: Object.freeze({ name: 'COLE', url: origin + '/CSC-SYNC-Org/cole.html' }),
    officers: Object.freeze({ name: 'CSC Officers', url: origin + '/CSC-SYNC-Admin/csc-officers.html' })
  });
  const policies = Object.freeze({
    'CSC-SYNC-PublicView': Object.freeze(['students']),
    'CSC-SYNC-Org': Object.freeze(['cole']),
    'CSC-SYNC-Admin': Object.freeze(['officers']),
    'CSC-TRACE-StudentView': Object.freeze(['students', 'cole']),
    'CSC-TRACE-Admin': Object.freeze(['officers']),
    'CSC-L.I.V.E.-StudentView': Object.freeze(['students', 'cole']),
    'CSC-L.I.V.E.': Object.freeze(['officers'])
  });
  function resolve(site, href, storedPortal) {
    const allowed = policies[site];
    if (!allowed) throw new Error('Unknown CSC website');
    const requested = new URL(href).searchParams.getAll('csc_portal');
    const explicit = requested.length > 0;
    const valid = requested.length === 1 && allowed.includes(requested[0]);
    const portal = explicit ? valid ? requested[0] : allowed[0] : allowed.includes(storedPortal) ? storedPortal : allowed[0];
    return Object.freeze({ portal, returnUrl: portals[portal].url, name: portals[portal].name, rejected: explicit && !valid });
  }
  root.CSCPortalPolicy = Object.freeze({ resolve, portals, policies });
})(globalThis);
