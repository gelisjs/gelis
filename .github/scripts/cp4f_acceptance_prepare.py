from pathlib import Path

candidate = "1e19a185eafbe271125eb73fc9f389413345ea8b"

accept_src = Path("bench/runtime/cp4e-deferred-trailing-metadata-acceptance.mts").read_text()
accept = accept_src
accept = accept.replace("cp4e-deferred-trailing-metadata-worker.mts", "cp4f-method-table-kind-worker.mts")
accept = accept.replace("f18e43623eeafe6356248b174b3ae2112bcc8e82", candidate)
accept = accept.replace("CP4-E deferred trailing-metadata candidate", "CP4-F method-table kind candidate")
accept = accept.replace("CP4-E CORRECTNESS PROBE", "CP4-F CORRECTNESS PROBE")
accept = accept.replace("Frozen CP4-E deferred trailing-metadata gates", "Frozen CP4-F method-table kind gates")
accept = accept.replace("CP4-E DEFERRED TRAILING-METADATA GATE", "CP4-F METHOD-TABLE KIND GATE")
accept = accept.replace("CP4-E LOCAL DEFERRED TRAILING-METADATA RUN: COMPLETE", "CP4-F LOCAL METHOD-TABLE KIND RUN: COMPLETE")
accept = accept.replace("CP4-E requires", "CP4-F requires")
accept = accept.replace("CP4-E source", "CP4-F source")
accept = accept.replace("gelis-cp4e-production-", "gelis-cp4f-production-")
Path("bench/runtime/cp4f-method-table-kind-acceptance.mts").write_text(accept)

worker_src = Path("bench/runtime/cp4e-deferred-trailing-metadata-worker.mts").read_text()
worker = worker_src.replace("cp4e-app=", "cp4f-app=")
worker = worker.replace("cp4e-router=", "cp4f-router=")
worker = worker.replace("source=cp4d", "source=cp4f")
Path("bench/runtime/cp4f-method-table-kind-worker.mts").write_text(worker)
