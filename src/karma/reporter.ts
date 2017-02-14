import { Collector, Store } from "istanbul";
import { ConfigOptions } from "karma";
import * as lodash from "lodash";
import { Logger } from "log4js";

import path = require("path");

import Configuration = require("../configuration");
import SharedProcessedFiles = require("../shared-processed-files");

class Reporter {

    public create: { (karmaConfig: ConfigOptions, helper: any, logger: any, emitter: any): void };

    private coverageReporter = require("karma-coverage/lib/reporter");
    private log: Logger;
    private remap = require("remap-istanbul/lib/remap");
    private writeReport = require("remap-istanbul/lib/writeReport");

    constructor(config: Configuration, sharedProcessedFiles: SharedProcessedFiles) {

        let self = this;

        // tslint:disable-next-line:only-arrow-functions
        this.create = function (karmaConfig: ConfigOptions, helper: any, logger: any, emitter: any) {

            let coverageMap: WeakMap<any, any>;
            let remapOptions = config.remapOptions;

            self.log = logger.create("reporter.karma-typescript");

            config.initialize(karmaConfig, logger);

            if (!config.hasReporter("coverage")) {
                self.coverageReporter(karmaConfig, helper, logger, emitter);
            }

            this.adapters = [];

            this.onRunStart = () => {
                coverageMap = new WeakMap<any, any>();
            };

            this.onBrowserComplete = (browser: any, result: any) => {
                if (!result || !result.coverage) {
                    return;
                }
                coverageMap.set(browser, result.coverage);
            };

            this.onRunComplete = (browsers: any[]) => {

                browsers.forEach((browser: any) => {

                    let coverage = coverageMap.get(browser);
                    let unmappedCollector = new Collector();

                    if (!coverage) {
                        return;
                    }

                    unmappedCollector.add(coverage);

                    let sourceStore = (<any> Store).create("memory");
                    remapOptions.sources = sourceStore;
                    remapOptions.readFile = (filepath: string) => {
                        return sharedProcessedFiles[filepath];
                    };
                    let collector = self.remap((<any> unmappedCollector).getFinalCoverage(), remapOptions);

                    Promise
                        .all(Object.keys(config.reports)
                        .map((reportType) => {

                            let destination = self.getReportDestination(browser, config.reports, reportType);

                            if (destination) {
                                self.log.debug("Writing coverage to %s", destination);
                            }

                            return self.writeReport(collector, reportType, {}, destination, sourceStore);
                        }))
                        .catch((error: any) => {
                            self.log.error(error);
                        })
                        .then(() => {
                            collector.dispose();
                            coverageMap = null;
                        });
                });
            };
        };

        (<any> this.create).$inject = ["config", "helper", "logger", "emitter"];
    }

    private getReportDestination(browser: any, reports: any, reportType: any) {

        let reportConfig = reports[reportType];

        if (lodash.isPlainObject(reportConfig)) {
            return path.join(reportConfig.directory || "coverage",
                             reportConfig.subdirectory || browser.name,
                             reportConfig.filename || reportType);
        }

        if (lodash.isString(reportConfig) && reportConfig.length > 0) {
            return path.join(reportConfig, browser.name, reportType);
        }

        return null;
    }
}

export = Reporter;
