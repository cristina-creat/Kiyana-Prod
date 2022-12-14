## How to: Reset 1 conciliacion

db.queuequeries.update({_conciliacion:ObjectId('62b0e594a582435ef931b57e')},{$set:{activities:[], status: 'pending'}});
db.conciliacions.update({_id:ObjectId('62b0e594a582435ef931b57e')},{$set:{status: 'pending'}});
db.conciliacionresults.remove({_conciliacion:ObjectId('62b0e594a582435ef931b57e')},{multi: true});

rm -rf downloads/62b0e594a582435ef931b57e