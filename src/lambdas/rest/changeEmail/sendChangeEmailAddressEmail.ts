import {sendEmail} from "../../../utils/emailUtils";
import {TokenAction} from "../../../db/TokenAction";
import log = require("loglevel");

const changeEmailAddressEmail = "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\"><html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"en\" xml:lang=\"en\"><head><meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Reset Your Lightrail Password</title><style>@media only screen{html{min-height:100%;background:#FAFAFA}}@media only screen and (max-width:596px){table.body center{min-width:0!important}table.body .container{width:95%!important}table.body .columns{height:auto!important;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;box-sizing:border-box;padding-left:16px!important;padding-right:16px!important}th.small-1{display:inline-block!important;width:8.33333%!important}th.small-10{display:inline-block!important;width:83.33333%!important}th.small-11{display:inline-block!important;width:91.66667%!important}th.small-12{display:inline-block!important;width:100%!important}table.menu{width:100%!important}table.menu td,table.menu th{width:auto!important;display:inline-block!important}table.menu.vertical td,table.menu.vertical th{display:block!important}table.menu[align=center]{width:auto!important}}@media only screen and (max-width:350px){h4.gift-code{font-size:18px}}@media only screen and (max-width:596px){.lr-logo{width:12px!important;height:24px!important}}@media only screen and (max-width:596px){.logo{width:56px!important;height:56px!important}}@media only screen and (max-width:596px){table.button table td a{font-size:14px!important}}@media all{a:hover{color:#083ddc}a:active{color:#083ddc}a:visited{color:#2056F7}table.button:active table a,table.button:hover table a,table.button:visited table a{border-width:0}table.button:active table td,table.button:hover table td,table.button:visited table td{background:#083ddc!important;color:#fff!important}}</style></head><body style=\"-moz-box-sizing:border-box;-moz-hyphens:none;-ms-hyphens:none;-ms-text-size-adjust:100%;-webkit-box-sizing:border-box;-webkit-hyphens:none;-webkit-text-size-adjust:100%;Margin:0;box-sizing:border-box;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;min-width:100%;padding:0;text-align:left;width:100%!important\"><span class=\"preheader\" style=\"color:#FAFAFA;display:none!important;font-size:1px;line-height:1px;max-height:0;max-width:0;mso-hide:all!important;opacity:0;overflow:hidden;visibility:hidden\">We received a request to reset the password for your account.</span><table class=\"body\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;background:#FAFAFA;border-collapse:collapse;border-spacing:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;height:100%;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><td class=\"center\" align=\"center\" valign=\"top\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\"><center data-parsed=\"\" style=\"min-width:580px;width:100%\"><table class=\"spacer float-center\" style=\"Margin:0 auto;border-collapse:collapse;border-spacing:0;float:none;margin:0 auto;padding:0;text-align:center;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"24px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:400;hyphens:none;line-height:24px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table><table align=\"center\" class=\"container header float-center\" style=\"Margin:0 auto;background:#fff;background-color:#2056F7;border-collapse:collapse;border-spacing:0;float:none;margin:0 auto;padding:0;text-align:center;vertical-align:top;width:580px\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\"><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"24px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:400;hyphens:none;line-height:24px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table><table class=\"row\" style=\"border-collapse:collapse;border-spacing:0;display:table;padding:0;position:relative;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><th class=\"small-12 large-12 columns first last\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:16px;padding-right:16px;text-align:left;width:564px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"><center data-parsed=\"\" style=\"min-width:532px;width:100%\"><img src=\"https://www.lightrail.com/assets/img/email/LR-Email-Full-Logo-WHT.png\" alt=\"Lightrail\" width=\"255\" height=\"48\" align=\"center\" class=\"float-center\" style=\"-ms-interpolation-mode:bicubic;Margin:0 auto;clear:both;display:block;float:none;margin:0 auto;max-width:100%;outline:0;text-align:center;text-decoration:none;width:auto\"></center></th><th class=\"expander\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0!important;text-align:left;visibility:hidden;width:0\"></th></tr></table></th></tr></tbody></table><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"8px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:8px;font-weight:400;hyphens:none;line-height:8px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table></td></tr></tbody></table><table align=\"center\" class=\"container body-container float-center\" style=\"Margin:0 auto;background:#fff;background-color:#EDF0F2;border-collapse:collapse;border-spacing:0;float:none;margin:0 auto;padding:0;text-align:center;vertical-align:top;width:580px\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\"><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"48px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:48px;font-weight:400;hyphens:none;line-height:48px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table><table class=\"row\" style=\"border-collapse:collapse;border-spacing:0;display:table;padding:0;position:relative;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><th class=\"small-1 large-1 columns first\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:16px;padding-right:8px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th><th class=\"small-10 large-10 columns\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:8px;text-align:left;width:467.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"><h1 class=\"text-center grey-text\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;Margin-bottom:0;color:#5A5C62;font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;hyphens:none;line-height:1.4;margin:0;margin-bottom:0;padding:0;text-align:center;word-wrap:normal\">Change Email Address</h1><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"20px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:400;hyphens:none;line-height:20px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table><p class=\"text-center grey-text\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;Margin-bottom:10px;color:#5A5C62;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;margin-bottom:10px;padding:0;text-align:center\">We received a request to change the email address for your account.</p></th></tr></table></th><th class=\"small-1 large-1 columns last\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:16px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th></tr></tbody></table><table class=\"row\" style=\"border-collapse:collapse;border-spacing:0;display:table;padding:0;position:relative;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><th class=\"small-1 large-1 columns first\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:16px;padding-right:8px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th><th class=\"small-10 large-10 columns\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:8px;text-align:left;width:467.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"><center data-parsed=\"\" style=\"min-width:435.33px;width:100%\"><table class=\"button radius uppercase-text float-center\" style=\"Margin:0 0 16px 0;border-collapse:collapse;border-spacing:0;float:none;margin:0 0 16px 0;padding:0;text-align:center;text-transform:uppercase;vertical-align:top;width:auto\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><td style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><td style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;background:#2056F7;border:none;border-collapse:collapse!important;border-radius:4px;color:#fff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\"><a href=\"{{confirmChangeLink}}\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border:0 solid #2056F7;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;hyphens:none;line-height:1.4;margin:0;padding:16px 32px 16px 32px;text-align:left;text-decoration:none\">Confirm This Address</a></td></tr></table></td></tr></table></center><!--[if (gte mso 9)|(IE)]><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"10px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:400;hyphens:none;line-height:10px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table><![endif]--><p class=\"text-center grey-text text-small\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;Margin-bottom:10px;color:#72757d;font-family:Helvetica,Arial,sans-serif;font-size:80%;font-weight:400;hyphens:none;line-height:1.4;margin:0;margin-bottom:10px;padding:0;text-align:center\">If you didn’t request this, you can ignore this email.</p></th></tr></table></th><th class=\"small-1 large-1 columns last\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:16px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th></tr></tbody></table><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"20px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:400;hyphens:none;line-height:20px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table></td></tr></tbody></table><table align=\"center\" class=\"container footer-container float-center\" style=\"Margin:0 auto;background:#fff;background-color:#DCDFE0;border-collapse:collapse;border-spacing:0;float:none;margin:0 auto;padding:0;text-align:center;vertical-align:top;width:580px\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\"><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"44px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:44px;font-weight:400;hyphens:none;line-height:44px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table><table class=\"row\" style=\"border-collapse:collapse;border-spacing:0;display:table;padding:0;position:relative;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><th class=\"small-1 large-1 columns first\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:16px;padding-right:8px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th><th class=\"small-10 large-10 columns\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:8px;text-align:left;width:467.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"><p class=\"text-center grey-text\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;Margin-bottom:10px;color:#5A5C62;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;margin-bottom:10px;padding:0;text-align:center\">Need Help?<br>Contact <a href=\"mailto:hello@lightrail.com\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2056F7;font-family:Helvetica,Arial,sans-serif;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;text-decoration:none\">Customer Support</a></p></th></tr></table></th><th class=\"small-1 large-1 columns last\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:16px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th></tr></tbody></table><table class=\"row\" style=\"border-collapse:collapse;border-spacing:0;display:table;padding:0;position:relative;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><th class=\"small-1 large-1 columns first\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:16px;padding-right:8px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th><th class=\"small-10 large-10 columns\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:8px;text-align:left;width:467.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"><hr style=\"Margin:0;border:1px solid #a6aeb0;height:0;margin:0\"></th></tr></table></th><th class=\"small-1 large-1 columns last\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:16px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th></tr></tbody></table><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"10px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:400;hyphens:none;line-height:10px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table><table class=\"row\" style=\"border-collapse:collapse;border-spacing:0;display:table;padding:0;position:relative;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><th class=\"small-1 large-1 columns first\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:16px;padding-right:8px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th><th class=\"small-11 large-11 columns\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:8px;text-align:left;width:515.67px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"><a href=\"https://www.lightrail.com/\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2056F7;font-family:Helvetica,Arial,sans-serif;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left;text-decoration:none\"><center data-parsed=\"\" style=\"min-width:483.67px;width:100%\"><img src=\"https://www.lightrail.com/assets/img/email/email-lightrail-logo.png\" class=\"lr-logo float-center\" alt=\"lightrail\" width=\"12\" height=\"24\" align=\"center\" style=\"-ms-interpolation-mode:bicubic;Margin:0 auto;border:none;clear:both;display:block;float:none;height:24px;margin:0 auto;max-width:100%;outline:0;text-align:center;text-decoration:none;width:12px\"></center></a></th></tr></table></th><th class=\"small-1 large-1 columns last\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:16px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th></tr></tbody></table><table class=\"row\" style=\"border-collapse:collapse;border-spacing:0;display:table;padding:0;position:relative;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><th class=\"small-1 large-1 columns first\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:16px;padding-right:8px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th><th class=\"small-10 large-10 columns\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:8px;text-align:left;width:467.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"><p class=\"no-margin-bottom text-small text-center\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;Margin-bottom:10px;color:#72757d;font-family:Helvetica,Arial,sans-serif;font-size:80%;font-weight:400;hyphens:none;line-height:1.4;margin:0;margin-bottom:10px;padding:0;text-align:center\">Copyright {{copyrightYear}}&copy; Lightrail. All Rights Reserved.</p></th></tr></table></th><th class=\"small-1 large-1 columns last\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0 auto;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0 auto;padding:0;padding-bottom:16px;padding-left:8px;padding-right:16px;text-align:left;width:32.33px\"><table style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tr style=\"padding:0;text-align:left;vertical-align:top\"><th style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;hyphens:none;line-height:1.4;margin:0;padding:0;text-align:left\"></th></tr></table></th></tr></tbody></table><table class=\"spacer\" style=\"border-collapse:collapse;border-spacing:0;padding:0;text-align:left;vertical-align:top;width:100%\"><tbody><tr style=\"padding:0;text-align:left;vertical-align:top\"><td height=\"10px\" style=\"-moz-hyphens:none;-ms-hyphens:none;-webkit-hyphens:none;Margin:0;border-collapse:collapse!important;color:#2C2C35;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:400;hyphens:none;line-height:10px;margin:0;mso-line-height-rule:exactly;padding:0;text-align:left;vertical-align:top;word-wrap:break-word\">&#xA0;</td></tr></tbody></table></td></tr></tbody></table></center></td></tr></table><!-- prevent Gmail on iOS font size manipulation --><div style=\"display:none;white-space:nowrap;font:15px courier;line-height:0\">&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;</div></body></html>";

export async function sendChangeEmailAddressEmail(userId: string, email: string): Promise<void> {
    const tokenAction = TokenAction.generate("changeEmail", 24, {email, userId});
    await TokenAction.put(tokenAction);

    const confirmChangeLink = `https://${process.env["LIGHTRAIL_DOMAIN"]}/v2/user/changeEmail/complete?token=${encodeURIComponent(tokenAction.token)}`;
    const body = changeEmailAddressEmail.replace(/{{confirmChangeLink}}/g, confirmChangeLink)
        .replace(/{{copyrightYear}}/g, new Date().getFullYear() + "");

    log.info("Sending change email address email to", email, "userId=", userId, "token=", tokenAction.token);
    await sendEmail({
        toAddress: email,
        subject: "Change Your Lightrail Email Address",
        htmlBody: body
    });
}
